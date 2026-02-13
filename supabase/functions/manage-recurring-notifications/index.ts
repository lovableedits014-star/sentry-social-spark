/**
 * manage-recurring-notifications - Edge Function
 * 
 * Manages Recurring Notification (Marketing Messages) opt-ins:
 * - send-optin: Sends opt-in request to a supporter via Messenger
 * - send-optin-bulk: Sends opt-in requests to all eligible supporters
 * - webhook: Handles Meta webhook callback when supporter opts in
 * - list: Lists current tokens for a client
 * - stats: Returns opt-in stats
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function buildGraphUrl(path: string, params: Record<string, string>): string {
  const url = new URL(`https://graph.facebook.com/v21.0/${path.replace(/^\//, '')}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

const FUNCTION_START = Date.now();
const MAX_RUNTIME_MS = 50_000;
function hasTimeLeft(marginMs = 5000): boolean {
  return (Date.now() - FUNCTION_START) < (MAX_RUNTIME_MS - marginMs);
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function randomDelay(minSec: number, maxSec: number): number {
  return Math.floor(Math.random() * (maxSec - minSec + 1) + minSec) * 1000;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Webhook verification (GET) - Meta sends this to verify the endpoint
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      if (mode === 'subscribe' && token === Deno.env.get('META_WEBHOOK_VERIFY_TOKEN')) {
        return new Response(challenge, { status: 200, headers: corsHeaders });
      }
      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    }

    const body = await req.json();

    // ============ WEBHOOK from Meta ============
    if (body.object === 'page' || body.object === 'instagram') {
      // Process webhook entries
      for (const entry of body.entry || []) {
        for (const event of entry.messaging || []) {
          if (event.optin && event.optin.type === 'notification_messages') {
            const senderId = event.sender?.id;
            const token = event.optin.notification_messages_token;
            const frequency = event.optin.notification_messages_frequency || 'daily';
            const tokenExpiresAt = event.optin.token_expiry_timestamp;
            const pageId = entry.id;

            if (!senderId || !token) continue;

            // Find the supporter by platform_user_id
            const { data: profiles } = await supabase
              .from('supporter_profiles')
              .select('supporter_id, supporter:supporters(client_id)')
              .eq('platform_user_id', senderId);

            if (profiles && profiles.length > 0) {
              for (const profile of profiles) {
                const clientId = (profile as any).supporter?.client_id;
                if (!clientId) continue;

                await supabase
                  .from('recurring_notification_tokens')
                  .upsert({
                    client_id: clientId,
                    supporter_id: profile.supporter_id,
                    platform_user_id: senderId,
                    token,
                    token_status: 'active',
                    frequency,
                    expires_at: tokenExpiresAt 
                      ? new Date(tokenExpiresAt * 1000).toISOString() 
                      : null,
                    opted_in_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  }, { onConflict: 'client_id,supporter_id,platform_user_id' });
              }
            }

            console.log(`[Webhook] Opt-in received from ${senderId}, frequency: ${frequency}`);
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============ Authenticated actions ============
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tokenStr = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(tokenStr);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, clientId } = body;

    // Verify ownership
    const { data: clientOwner } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('user_id', user.id)
      .single();

    if (!clientOwner) {
      return new Response(JSON.stringify({ success: false, error: 'Acesso não autorizado' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get integration
    const { data: integration } = await supabase
      .from('integrations')
      .select('meta_access_token, meta_page_id')
      .eq('client_id', clientId)
      .single();

    if (!integration?.meta_access_token || !integration?.meta_page_id) {
      return new Response(JSON.stringify({ success: false, error: 'Token Meta não configurado' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Derive page access token
    let accessToken = integration.meta_access_token;
    try {
      const resp = await fetch(buildGraphUrl(integration.meta_page_id, { fields: 'access_token', access_token: accessToken }));
      if (resp.ok) {
        const data = await resp.json();
        if (data.access_token) accessToken = data.access_token;
      }
    } catch (e) {
      console.warn('Could not derive page token:', e);
    }

    // ============ SEND OPT-IN (single) ============
    if (action === 'send-optin') {
      const { supporterId, frequency = 'daily' } = body;

      // Get supporter profile
      const { data: profiles } = await supabase
        .from('supporter_profiles')
        .select('platform_user_id, platform')
        .eq('supporter_id', supporterId)
        .eq('platform', 'facebook');

      const profile = profiles?.[0];
      if (!profile?.platform_user_id) {
        return new Response(JSON.stringify({ success: false, error: 'Apoiador sem perfil Facebook vinculado' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const result = await sendOptInRequest(
        integration.meta_page_id, accessToken, profile.platform_user_id, frequency
      );

      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============ SEND OPT-IN BULK ============
    if (action === 'send-optin-bulk') {
      const { frequency = 'daily' } = body;

      // Get active supporters with Facebook profiles that don't have active tokens
      const { data: supporters } = await supabase
        .from('supporters')
        .select(`
          id, name,
          supporter_profiles (platform_user_id, platform)
        `)
        .eq('client_id', clientId)
        .in('classification', ['apoiador_ativo', 'apoiador_passivo']);

      if (!supporters || supporters.length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'Nenhum apoiador ativo encontrado' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get existing active tokens
      const { data: existingTokens } = await supabase
        .from('recurring_notification_tokens')
        .select('supporter_id')
        .eq('client_id', clientId)
        .eq('token_status', 'active');

      const tokensSet = new Set(existingTokens?.map(t => t.supporter_id) || []);

      let sent = 0;
      let skipped = 0;
      let failed = 0;

      for (const s of supporters) {
        if (!hasTimeLeft(8000)) break;

        // Skip if already has active token
        if (tokensSet.has(s.id)) {
          skipped++;
          continue;
        }

        const profiles = (s as any).supporter_profiles || [];
        const fbProfile = profiles.find((p: any) => p.platform === 'facebook');

        if (!fbProfile?.platform_user_id) {
          skipped++;
          continue;
        }

        const result = await sendOptInRequest(
          integration.meta_page_id, accessToken, fbProfile.platform_user_id, frequency
        );

        if (result.success) {
          sent++;
        } else {
          failed++;
          console.warn(`Opt-in failed for ${s.name}:`, result.error);
        }

        // Delay between sends
        const delay = randomDelay(3, 8);
        if (hasTimeLeft(delay + 5000)) {
          await sleep(delay);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        sent,
        skipped,
        failed,
        total: supporters.length,
        message: `Opt-in enviado para ${sent} apoiadores. ${skipped} já tinham token ou sem perfil. ${failed} falhas.`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ============ LIST TOKENS ============
    if (action === 'list') {
      const { data: tokens } = await supabase
        .from('recurring_notification_tokens')
        .select(`
          id, supporter_id, platform_user_id, token_status, frequency, 
          expires_at, opted_in_at, last_used_at,
          supporter:supporters(name)
        `)
        .eq('client_id', clientId)
        .order('opted_in_at', { ascending: false });

      return new Response(JSON.stringify({ success: true, tokens: tokens || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============ STATS ============
    if (action === 'stats') {
      const { data: tokens } = await supabase
        .from('recurring_notification_tokens')
        .select('token_status')
        .eq('client_id', clientId);

      const { data: totalSupporters } = await supabase
        .from('supporters')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .in('classification', ['apoiador_ativo', 'apoiador_passivo']);

      const active = tokens?.filter(t => t.token_status === 'active').length || 0;
      const expired = tokens?.filter(t => t.token_status === 'expired').length || 0;
      const revoked = tokens?.filter(t => t.token_status === 'revoked').length || 0;

      return new Response(JSON.stringify({
        success: true,
        stats: { active, expired, revoked, total: tokens?.length || 0, totalSupporters: totalSupporters?.length || 0 },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: false, error: 'Ação inválida' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in manage-recurring-notifications:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function sendOptInRequest(
  pageId: string, accessToken: string, recipientId: string, frequency: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const resp = await fetch(
      buildGraphUrl(`${pageId}/messages`, { access_token: accessToken }),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: {
            attachment: {
              type: 'template',
              payload: {
                template_type: 'notification_messages',
                title: 'Receba nossas atualizações e novidades!',
                image_url: '',
                payload: 'RECURRING_OPTIN',
                notification_messages_frequency: frequency.toUpperCase(),
                notification_messages_reoptin: 'ENABLED',
                notification_messages_timezone: 'America/Sao_Paulo',
              },
            },
          },
          messaging_type: 'UPDATE',
        }),
      }
    );

    if (resp.ok) {
      return { success: true };
    } else {
      const errData = await resp.json();
      return { success: false, error: errData?.error?.message || `HTTP ${resp.status}` };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
