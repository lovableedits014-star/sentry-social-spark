import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RequestSchema = z.object({
  commentId: z.string().uuid(),
  clientId: z.string().uuid(),
  responseText: z.string().min(1).max(5000),
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
    const { commentId, clientId, responseText } = body;

    // Verify user owns this client
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

    // Get comment (also verify it belongs to this client)
    const { data: comment, error: commentError } = await supabaseClient
      .from('comments')
      .select('comment_id, post_id, platform')
      .eq('id', commentId)
      .eq('client_id', clientId)
      .single();

    if (commentError || !comment) {
      return new Response(
        JSON.stringify({ success: false, error: 'Comentário não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get integration
    const { data: integration, error: intError } = await supabaseClient
      .from('integrations')
      .select('meta_access_token, meta_page_id')
      .eq('client_id', clientId)
      .single();

    if (intError || !integration?.meta_access_token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Integração Meta não configurada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Derive page access token if needed
    let pageAccessToken = integration.meta_access_token;
    try {
      const pageTokenResp = await fetch(
        `https://graph.facebook.com/v21.0/${integration.meta_page_id}?fields=access_token&access_token=${integration.meta_access_token}`
      );
      if (pageTokenResp.ok) {
        const pageInfo = await pageTokenResp.json();
        if (pageInfo.access_token) {
          pageAccessToken = pageInfo.access_token;
        }
      }
    } catch (e) {
      console.warn('Could not derive page token, using stored token:', e);
    }

    console.log('📡 Posting reply to Meta Graph API...', {
      comment_id: comment.comment_id,
      platform: comment.platform,
      response_length: responseText.length
    });

    // Use correct endpoint based on platform
    const isInstagram = comment.platform === 'instagram';
    const metaApiUrl = isInstagram
      ? `https://graph.facebook.com/v21.0/${comment.comment_id}/replies`
      : `https://graph.facebook.com/v21.0/${comment.comment_id}/comments`;
    
    const params = new URLSearchParams({
      message: responseText,
      access_token: pageAccessToken
    });

    const response = await fetch(`${metaApiUrl}?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const responseBody = await response.text();
    console.log('📥 Meta API response status:', response.status);

    if (!response.ok) {
      let errorMessage = 'Falha ao responder comentário';
      try {
        const errorData = JSON.parse(responseBody);
        const code = errorData.error?.code;
        const subcode = errorData.error?.error_subcode;
        console.error('❌ Meta API error:', errorData);

        // Facebook temporary rate limit / spam block
        if (code === 32 || code === 368 || subcode === 1404104 || subcode === 2207001) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: '⏳ Facebook bloqueou temporariamente as respostas por excesso de ações. Aguarde alguns minutos antes de tentar novamente.',
              code: 'RATE_LIMITED'
            }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        errorMessage = errorData.error?.error_user_msg || errorData.error?.message || errorMessage;
      } catch {
        console.error('❌ Meta API error (non-JSON):', responseBody);
      }
      return new Response(
        JSON.stringify({ success: false, error: `Erro Meta API: ${errorMessage}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = JSON.parse(responseBody);
    console.log('✅ Reply posted successfully:', data);

    // Update comment status
    await supabaseClient
      .from('comments')
      .update({ 
        status: 'responded',
        final_response: responseText,
        responded_at: new Date().toISOString()
      })
      .eq('id', commentId);

    // Log action
    await supabaseClient.from('action_logs').insert({
      client_id: clientId,
      user_id: user.id,
      action: 'respond_to_comment',
      status: 'success',
      details: { comment_id: commentId, reply_id: data.id }
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        reply_id: data.id,
        message: 'Resposta enviada com sucesso!'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error responding to comment:', error);
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
