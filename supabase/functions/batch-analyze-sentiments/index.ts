import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { getClientLLMConfig, callLLM, type LLMMessage } from '../_shared/llm-router.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RequestSchema = z.object({
  clientId: z.string().uuid(),
  reanalyzeAll: z.boolean().optional().default(false),
});

const MAX_RUNTIME_MS = 50000; // 50s safety margin

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = RequestSchema.parse(await req.json());
    const { clientId, reanalyzeAll } = body;

    // Verify user owns the client
    const { data: client, error: clientError } = await supabaseClient
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('user_id', user.id)
      .single();

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ success: false, error: 'Acesso não autorizado' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get LLM config
    const llmConfig = await getClientLLMConfig(supabaseClient, clientId);
    console.log(`📡 Using LLM provider: ${llmConfig.provider} for batch sentiment analysis`);

    // Fetch comments needing analysis (paginated, no 1000 limit)
    const PAGE_SIZE = 500;
    let allComments: { id: string; text: string; author_name: string | null }[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabaseClient
        .from('comments')
        .select('id, text, author_name')
        .eq('client_id', clientId)
        .not('text', 'eq', '__post_stub__')
        .eq('is_page_owner', false)
        .order('comment_created_time', { ascending: false })
        .range(from, to);

      if (!reanalyzeAll) {
        query = query.is('sentiment', null);
      }

      const { data, error } = await query;
      if (error) throw error;

      allComments = [...allComments, ...(data || [])];
      hasMore = (data?.length || 0) === PAGE_SIZE;
      page++;
    }

    console.log(`📊 Found ${allComments.length} comments to analyze`);

    if (allComments.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          analyzed: 0, 
          message: 'Todos os comentários já foram analisados' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process in batches of 10 comments at a time using batch prompt
    const BATCH_SIZE = 10;
    const startTime = Date.now();
    let analyzed = 0;
    let results = { positive: 0, negative: 0, neutral: 0 };

    for (let i = 0; i < allComments.length; i += BATCH_SIZE) {
      // Check runtime
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        console.log(`⏱️ Runtime limit reached, analyzed ${analyzed}/${allComments.length}`);
        break;
      }

      const batch = allComments.slice(i, i + BATCH_SIZE);
      
      try {
        const sentiments = await analyzeBatch(llmConfig, batch);
        
        // Update each comment
        for (const { id, sentiment } of sentiments) {
          await supabaseClient
            .from('comments')
            .update({ sentiment })
            .eq('id', id);
          
          if (sentiment === 'positive') results.positive++;
          else if (sentiment === 'negative') results.negative++;
          else results.neutral++;
          analyzed++;
        }
      } catch (error) {
        console.error(`Batch ${i} failed:`, error);
        // Continue with next batch
      }
    }

    const remaining = allComments.length - analyzed;
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        analyzed, 
        remaining,
        results,
        provider: llmConfig.provider,
        message: remaining > 0 
          ? `Analisados ${analyzed} comentários. Restam ${remaining} — execute novamente para continuar.`
          : `Todos os ${analyzed} comentários foram analisados!`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in batch sentiment analysis:', error);
    const errorMessage = error instanceof z.ZodError 
      ? 'Dados inválidos: ' + error.errors.map(e => e.message).join(', ')
      : error instanceof Error ? error.message : 'Erro desconhecido';
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function analyzeBatch(
  llmConfig: { provider: string; apiKey: string; model: string },
  comments: { id: string; text: string; author_name: string | null }[]
): Promise<{ id: string; sentiment: string }[]> {
  // Build batch prompt for more accurate analysis
  const commentList = comments.map((c, idx) => 
    `[${idx + 1}] "${c.text}"`
  ).join('\n');

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `Você é um analista de sentimentos RIGOROSO especializado em comentários de redes sociais de políticos brasileiros.

REGRA PRINCIPAL: A maioria dos comentários em redes sociais expressa alguma opinião. "neutral" é RARO — use apenas quando realmente não há sentimento.

CLASSIFICAÇÃO:

"positive" — QUALQUER forma de apoio, elogio, incentivo, gratidão, concordância, defesa, admiração, carinho, esperança, torcida. Inclui:
  • Elogios diretos: "parabéns", "muito bom", "excelente trabalho", "orgulho"
  • Apoio implícito: "tamo junto", "conte comigo", "vai dar certo", "força"
  • Emojis positivos: 👏❤️🙏💪🔥👍😍🥰✅💙💚
  • Agradecimentos: "obrigado", "gratidão", "Deus abençoe"
  • Defesa: "deixa ele trabalhar", "melhor prefeito", "tá certo"
  • Pedidos com tom positivo: "continua assim", "não desista"
  • Marcações com tom de apoio: "@amigo olha que legal"

"negative" — QUALQUER forma de crítica, reclamação, ataque, ironia destrutiva, cobrança agressiva, deboche, desprezo. Inclui:
  • Críticas: "não faz nada", "só promessa", "cadê?", "vergonha"
  • Ironia/sarcasmo: "ah claro, vai resolver sim 🤡", "tá de parabéns hein"
  • Cobranças hostis: "e o asfalto?", "minha rua tá abandonada"
  • Emojis negativos: 🤡🗑️🤮😡💩👎🤦‍♂️
  • Xingamentos e ofensas de qualquer tipo
  • Deboche: "kkkk", "😂" quando zombando

"neutral" — SOMENTE quando não há nenhum sentimento detectável:
  • Marcação pura sem opinião: "@fulano"
  • Pergunta factual sem tom: "que horas é o evento?"
  • Comentário puramente informativo: "o endereço é rua X"

REGRAS OBRIGATÓRIAS:
1. Se há QUALQUER palavra de apoio, elogio ou carinho → positive
2. Se há QUALQUER crítica, reclamação ou ironia → negative  
3. "neutral" SÓ quando é impossível detectar sentimento
4. Emojis sozinhos (❤️👏🙏💪) → positive
5. Risadas em contexto de deboche → negative
6. Na dúvida entre positive e neutral → positive
7. Na dúvida entre negative e neutral → negative
8. Comentários religiosos de apoio ("Deus abençoe") → positive`
    },
    {
      role: 'user',
      content: `EXEMPLOS DE REFERÊNCIA:
"Parabéns pelo trabalho" → positive
"Deus abençoe sua gestão" → positive  
"👏👏👏" → positive
"Tamo junto prefeito!" → positive
"Continua assim, tá no caminho certo" → positive
"Meu voto é seu" → positive
"❤️🙏" → positive
"Obrigado por tudo" → positive
"Que Deus te proteja" → positive
"Só promessa e nada de ação" → negative
"Cadê o asfalto da minha rua?" → negative
"Vergonha 🤡" → negative
"kkkk tá de brincadeira né" → negative
"Pior prefeito da história" → negative
"@maria" → neutral
"Que horas começa?" → neutral

Agora classifique cada comentário abaixo. Responda APENAS no formato: número|sentimento (um por linha)

${commentList}

Resposta:`
    }
  ];

  const response = await callLLM(llmConfig as any, {
    messages,
    maxTokens: comments.length * 15,
    temperature: 0,
  });

  // Parse response
  const lines = response.content.trim().split('\n');
  const results: { id: string; sentiment: string }[] = [];

  for (const line of lines) {
    const match = line.match(/\[?(\d+)\]?\s*[|:\-]\s*(positive|negative|neutral)/i);
    if (match) {
      const idx = parseInt(match[1]) - 1;
      const sentiment = match[2].toLowerCase();
      if (idx >= 0 && idx < comments.length && ['positive', 'negative', 'neutral'].includes(sentiment)) {
        results.push({ id: comments[idx].id, sentiment });
      }
    }
  }

  // For any comments not matched, default to neutral
  for (let i = 0; i < comments.length; i++) {
    if (!results.find(r => r.id === comments[i].id)) {
      results.push({ id: comments[i].id, sentiment: 'neutral' });
    }
  }

  return results;
}
