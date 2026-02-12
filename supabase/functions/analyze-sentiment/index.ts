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
      .select('text')
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

    const sentiment = await analyzeSentiment(llmConfig, comment.text);

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
  text: string
): Promise<string> {
  const messages: LLMMessage[] = [
    {
      role: 'user',
      content: `Analise o sentimento do seguinte comentário e responda APENAS com uma palavra: "positive", "negative" ou "neutral".

Comentário: "${text}"

Resposta:`,
    },
  ];

  try {
    const response = await callLLM(llmConfig as any, {
      messages,
      maxTokens: 10,
      temperature: 0,
    });

    const result = response.content.toLowerCase().trim();
    
    if (['positive', 'negative', 'neutral'].includes(result)) {
      return result;
    }
    return 'neutral';
  } catch (error) {
    console.error('Sentiment analysis failed:', error);
    return 'neutral';
  }
}
