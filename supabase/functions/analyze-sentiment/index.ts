import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { getClientLLMConfig, callLLM, type LLMMessage } from '../_shared/llm-router.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RequestSchema = z.object({
  commentId: z.string().uuid(),
  clientId: z.string().uuid(),
});

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
    const { commentId, clientId } = body;

    // Verify user owns the client
    const { data: client, error: clientError } = await supabaseClient
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('user_id', user.id)
      .single();

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ success: false, error: 'Acesso não autorizado a este cliente' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get comment (verify it belongs to this client)
    const { data: comment, error: commentError } = await supabaseClient
      .from('comments')
      .select('text, post_message')
      .eq('id', commentId)
      .eq('client_id', clientId)
      .single();

    if (commentError || !comment) {
      return new Response(
        JSON.stringify({ success: false, error: 'Comentário não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get LLM config for this client
    const llmConfig = await getClientLLMConfig(supabaseClient, clientId);
    console.log(`📡 Using LLM provider: ${llmConfig.provider} for sentiment analysis`);

    // Get political context
    const { data: clientCtx } = await supabaseClient
      .from('clients')
      .select('name, cargo')
      .eq('id', clientId)
      .single();
    const ctx = {
      candidato: clientCtx?.name || 'o político',
      cargo: clientCtx?.cargo || 'político',
    };

    let sentiment = await analyzeSentiment(llmConfig, comment.text, comment.post_message, ctx);

    // Double-check negatives
    if (sentiment === 'negative') {
      const verdict = await verifyNegative(llmConfig, comment.text, comment.post_message, ctx);
      if (verdict !== 'negative') {
        console.log(`✅ Reclassified: negative → ${verdict}`);
        sentiment = verdict;
      }
    }

    // Update comment
    await supabaseClient
      .from('comments')
      .update({ sentiment })
      .eq('id', commentId);

    return new Response(
      JSON.stringify({ success: true, sentiment, provider: llmConfig.provider }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error analyzing sentiment:', error);
    const errorMessage = error instanceof z.ZodError 
      ? 'Dados inválidos: ' + error.errors.map(e => e.message).join(', ')
      : error instanceof Error
      ? error.message
      : 'Erro desconhecido';
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function analyzeSentiment(
  llmConfig: { provider: string; apiKey: string; model: string },
  text: string,
  postMessage: string | null,
  ctx: { candidato: string; cargo: string }
): Promise<string> {
  const postCtx = postMessage
    ? postMessage.substring(0, 200).replace(/\s+/g, ' ').trim()
    : '(sem contexto do post)';
  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `Você classifica sentimentos de comentários no perfil de "${ctx.candidato}" (${ctx.cargo}). Sempre interprete do ponto de vista do dono do perfil.

⚠️ USE O CONTEXTO DO POST: você recebe POST + COMENTÁRIO. Perguntas factuais sobre o post (ex: "Como fazer?", "Onde é?", "Tem link?", "Que horas?") em posts de evento/inscrição/anúncio = NEUTRAL, NUNCA negative.

Menções a aliados/candidatos da mesma corrente em tom otimista = POSITIVE.
- positive: elogio, apoio, incentivo, gratidão, emojis positivos (❤️👏🙏💪)
- negative: crítica, reclamação, ironia, deboche, xingamento, emojis negativos (🤡🤮)  
- neutral: marcações puras, perguntas factuais sobre o post, pedidos de informação prática
Na dúvida entre positive e negative, evite neutral. Mas perguntas práticas sobre o post SÃO neutral.`,
    },
    {
      role: 'user',
      content: `Classifique o sentimento e responda APENAS "positive", "negative" ou "neutral":

POST: "${postCtx}"
COMENTÁRIO: "${text}"`,
    },
  ];

  try {
    const response = await callLLM(llmConfig as any, {
      messages,
      maxTokens: 10,
      temperature: 0,
    });

    const result = response.content.toLowerCase().trim().replace(/[^a-z]/g, '');
    
    if (['positive', 'negative', 'neutral'].includes(result)) {
      return result;
    }
    // Extract from longer responses
    if (result.includes('positive')) return 'positive';
    if (result.includes('negative')) return 'negative';
    if (result.includes('neutral')) return 'neutral';
    return 'neutral';
  } catch (error) {
    console.error('Sentiment analysis failed:', error);
    return 'neutral';
  }
}

async function verifyNegative(
  llmConfig: { provider: string; apiKey: string; model: string },
  text: string,
  postMessage: string | null,
  ctx: { candidato: string; cargo: string }
): Promise<string> {
  const postCtx = postMessage
    ? postMessage.substring(0, 200).replace(/\s+/g, ' ').trim()
    : '(sem contexto do post)';
  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `Você é um VERIFICADOR. Um analista classificou este comentário como NEGATIVO contra "${ctx.candidato}" (${ctx.cargo}). Confirme ou corrija.

⚠️ ATENÇÃO AO POST: Se o POST é anúncio/evento/inscrição e o COMENTÁRIO é só pergunta prática (Como fazer? Onde? Tem link?) → NEUTRAL, não negativo!

REALMENTE negativo só se: critica/ataca/debocha/ofende "${ctx.candidato}" especificamente, ou faz comparação desfavorável.

NÃO é negativo (responda positive ou neutral) se: elogia/projeta futuro para "${ctx.candidato}" OU ALIADOS, menciona outro candidato da mesma corrente em tom de apoio (ex: "tem futuro com nosso pré-candidato X" = POSITIVE), é pergunta prática sobre o post, ou é neutro/factual.

Responda APENAS: positive, negative ou neutral.`,
    },
    { role: 'user', content: `POST: "${postCtx}"\nCOMENTÁRIO: "${text}"\n\nÉ realmente negativo contra ${ctx.candidato}?` },
  ];

  try {
    const response = await callLLM(llmConfig as any, { messages, maxTokens: 10, temperature: 0 });
    const result = response.content.toLowerCase().trim().replace(/[^a-z]/g, '');
    if (['positive', 'negative', 'neutral'].includes(result)) return result;
    if (result.includes('positive')) return 'positive';
    if (result.includes('neutral')) return 'neutral';
    return 'negative';
  } catch {
    return 'negative';
  }
}
