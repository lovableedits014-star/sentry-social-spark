/**
 * send-engagement-messages - Edge Function
 * 
 * Processes a dispatch queue: sends messages to active supporters via
 * Facebook Messenger / Instagram DM with anti-blocking delays.
 * 
 * Actions:
 * - create: Creates a new dispatch with items for all active supporters
 * - process: Processes pending items in batches with delays
 * - cancel: Cancels a pending/processing dispatch
 * - status: Returns dispatch status
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

function randomDelay(minSec: number, maxSec: number): number {
  return Math.floor(Math.random() * (maxSec - minSec + 1) + minSec) * 1000;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const FUNCTION_START = Date.now();
const MAX_RUNTIME_MS = 50_000;
function hasTimeLeft(marginMs = 5000): boolean {
  return (Date.now() - FUNCTION_START) < (MAX_RUNTIME_MS - marginMs);
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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action, clientId, dispatchId } = body;

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

    // ============ CREATE ============
    if (action === 'create') {
      const { postId, postPermalinkUrl, postPlatform, messageTemplate, batchSize, batchDelaySeconds, messageDelayMin, messageDelayMax } = body;

      if (!postId || !messageTemplate) {
        return new Response(JSON.stringify({ success: false, error: 'postId e messageTemplate são obrigatórios' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get active supporters with platform profiles
      const { data: supporters, error: suppError } = await supabase
        .from('supporters')
        .select(`
          id, name,
          supporter_profiles (platform, platform_user_id, platform_username)
        `)
        .eq('client_id', clientId)
        .in('classification', ['apoiador_ativo', 'apoiador_passivo']);

      if (suppError) throw suppError;

      if (!supporters || supporters.length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'Nenhum apoiador ativo encontrado' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create dispatch
      const { data: dispatch, error: dispatchError } = await supabase
        .from('message_dispatches')
        .insert({
          client_id: clientId,
          post_id: postId,
          post_permalink_url: postPermalinkUrl || null,
          post_platform: postPlatform || 'facebook',
          message_template: messageTemplate,
          total_recipients: supporters.length,
          batch_size: batchSize || 20,
          batch_delay_seconds: batchDelaySeconds || 180,
          message_delay_min_seconds: messageDelayMin || 15,
          message_delay_max_seconds: messageDelayMax || 45,
          status: 'pending',
        })
        .select()
        .single();

      if (dispatchError) throw dispatchError;

      // Create dispatch items for each supporter
      const items = supporters.map((s: any) => {
        // Try to find best platform profile for messaging
        const profiles = s.supporter_profiles || [];
        const fbProfile = profiles.find((p: any) => p.platform === 'facebook');
        const igProfile = profiles.find((p: any) => p.platform === 'instagram');
        const bestProfile = fbProfile || igProfile;

        return {
          dispatch_id: dispatch.id,
          supporter_id: s.id,
          supporter_name: s.name,
          platform: bestProfile?.platform || 'facebook',
          platform_user_id: bestProfile?.platform_user_id || null,
          status: bestProfile?.platform_user_id ? 'pending' : 'skipped',
          error_message: bestProfile?.platform_user_id ? null : 'Sem perfil de rede social vinculado',
        };
      });

      // Insert items in batches
      const skippedCount = items.filter((i: any) => i.status === 'skipped').length;
      for (let i = 0; i < items.length; i += 50) {
        const chunk = items.slice(i, i + 50);
        await supabase.from('dispatch_items').insert(chunk);
      }

      return new Response(JSON.stringify({
        success: true,
        dispatch: dispatch,
        totalRecipients: supporters.length,
        skipped: skippedCount,
        message: `Disparo criado! ${supporters.length} apoiadores, ${skippedCount} sem perfil vinculado.`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ============ PROCESS ============
    if (action === 'process') {
      if (!dispatchId) {
        return new Response(JSON.stringify({ success: false, error: 'dispatchId obrigatório' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get dispatch
      const { data: dispatch, error: dErr } = await supabase
        .from('message_dispatches')
        .select('*')
        .eq('id', dispatchId)
        .eq('client_id', clientId)
        .single();

      if (dErr || !dispatch) {
        return new Response(JSON.stringify({ success: false, error: 'Disparo não encontrado' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (dispatch.status === 'cancelled') {
        return new Response(JSON.stringify({ success: false, error: 'Disparo foi cancelado' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update status to processing
      await supabase
        .from('message_dispatches')
        .update({ status: 'processing', started_at: dispatch.started_at || new Date().toISOString() })
        .eq('id', dispatchId);

      // Get integration for access token
      const { data: integration } = await supabase
        .from('integrations')
        .select('meta_access_token, meta_page_id, meta_instagram_id')
        .eq('client_id', clientId)
        .single();

      if (!integration?.meta_access_token) {
        await supabase
          .from('message_dispatches')
          .update({ status: 'error', error_message: 'Token Meta não configurado' })
          .eq('id', dispatchId);
        return new Response(JSON.stringify({ success: false, error: 'Token Meta não configurado' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Derive page access token
      let accessToken = integration.meta_access_token;
      try {
        const resp = await fetch(buildGraphUrl(integration.meta_page_id!, { fields: 'access_token', access_token: accessToken }));
        if (resp.ok) {
          const data = await resp.json();
          if (data.access_token) accessToken = data.access_token;
        }
      } catch (e) {
        console.warn('Could not derive page token:', e);
      }

      // Get pending items (one batch)
      const batchSize = dispatch.batch_size || 20;
      const { data: pendingItems } = await supabase
        .from('dispatch_items')
        .select('*')
        .eq('dispatch_id', dispatchId)
        .eq('status', 'pending')
        .limit(batchSize);

      if (!pendingItems || pendingItems.length === 0) {
        // All done
        const { data: counts } = await supabase
          .from('dispatch_items')
          .select('status')
          .eq('dispatch_id', dispatchId);

        const sentCount = counts?.filter((c: any) => c.status === 'sent').length || 0;
        const failedCount = counts?.filter((c: any) => c.status === 'failed').length || 0;

        await supabase
          .from('message_dispatches')
          .update({ 
            status: 'completed', 
            completed_at: new Date().toISOString(),
            sent_count: sentCount,
            failed_count: failedCount,
          })
          .eq('id', dispatchId);

        return new Response(JSON.stringify({
          success: true,
          completed: true,
          sentCount,
          failedCount,
          message: `Disparo concluído! ${sentCount} enviados, ${failedCount} falhas.`,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Process this batch
      let sentInBatch = 0;
      let failedInBatch = 0;

      for (const item of pendingItems) {
        // Check if dispatch was cancelled
        const { data: currentDispatch } = await supabase
          .from('message_dispatches')
          .select('status')
          .eq('id', dispatchId)
          .single();

        if (currentDispatch?.status === 'cancelled') {
          // Cancel remaining items
          await supabase
            .from('dispatch_items')
            .update({ status: 'cancelled' })
            .eq('dispatch_id', dispatchId)
            .eq('status', 'pending');
          break;
        }

        if (!hasTimeLeft(8000)) {
          // Save progress and let client call again
          break;
        }

        if (!item.platform_user_id) {
          await supabase
            .from('dispatch_items')
            .update({ status: 'skipped', error_message: 'Sem ID de plataforma' })
            .eq('id', item.id);
          continue;
        }

        try {
          // Send message via Messenger (Facebook) or Instagram DM
          let sendSuccess = false;
          let sendError = '';

          if (item.platform === 'facebook') {
            // Try standard messaging first
            const msgResp = await fetch(
              buildGraphUrl(`${integration.meta_page_id}/messages`, { access_token: accessToken }),
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  recipient: { id: item.platform_user_id },
                  message: { text: dispatch.message_template },
                  messaging_type: 'UPDATE',
                }),
              }
            );

            if (msgResp.ok) {
              sendSuccess = true;
            } else {
              const errData = await msgResp.json();
              const errCode = errData?.error?.code;
              sendError = errData?.error?.message || `HTTP ${msgResp.status}`;
              console.warn(`[FB] Standard send failed for ${item.supporter_name} (code ${errCode}):`, sendError);

              // If outside 24h window (error 551 or 10), try recurring notification token
              if (errCode === 551 || errCode === 10) {
                const { data: tokenData } = await supabase
                  .from('recurring_notification_tokens')
                  .select('token, id')
                  .eq('supporter_id', item.supporter_id)
                  .eq('client_id', clientId)
                  .eq('token_status', 'active')
                  .limit(1)
                  .maybeSingle();

                if (tokenData?.token) {
                  console.log(`[FB] Trying recurring notification token for ${item.supporter_name}`);
                  const rnResp = await fetch(
                    buildGraphUrl(`${integration.meta_page_id}/messages`, { access_token: accessToken }),
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        recipient: { notification_messages_token: tokenData.token },
                        message: { text: dispatch.message_template },
                        messaging_type: 'MESSAGE_TAG',
                        tag: 'CONFIRMED_EVENT_UPDATE',
                      }),
                    }
                  );

                  if (rnResp.ok) {
                    sendSuccess = true;
                    sendError = '';
                    // Update last_used_at
                    await supabase
                      .from('recurring_notification_tokens')
                      .update({ last_used_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                      .eq('id', tokenData.id);
                    console.log(`[FB] Recurring notification sent to ${item.supporter_name}`);
                  } else {
                    const rnErr = await rnResp.json();
                    sendError = `Token recorrente falhou: ${rnErr?.error?.message || rnResp.status}`;
                    console.error(`[FB] Recurring notification also failed for ${item.supporter_name}:`, rnErr);
                    // Mark token as expired if specific error
                    if (rnErr?.error?.code === 551 || rnErr?.error?.code === 190) {
                      await supabase
                        .from('recurring_notification_tokens')
                        .update({ token_status: 'expired', updated_at: new Date().toISOString() })
                        .eq('id', tokenData.id);
                    }
                  }
                } else {
                  sendError = 'Fora da janela de 24h e sem token de notificação recorrente';
                }
              }
            }
          } else if (item.platform === 'instagram') {
            // Instagram DM
            const msgResp = await fetch(
              buildGraphUrl(`${integration.meta_instagram_id}/messages`, { access_token: accessToken }),
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  recipient: { id: item.platform_user_id },
                  message: { text: dispatch.message_template },
                }),
              }
            );

            if (msgResp.ok) {
              sendSuccess = true;
            } else {
              const errData = await msgResp.json();
              sendError = errData?.error?.message || `HTTP ${msgResp.status}`;
              console.error(`[IG] Send failed for ${item.supporter_name}:`, errData);
            }
          }

          if (sendSuccess) {
            await supabase
              .from('dispatch_items')
              .update({ status: 'sent', sent_at: new Date().toISOString() })
              .eq('id', item.id);
            sentInBatch++;
          } else {
            await supabase
              .from('dispatch_items')
              .update({ status: 'failed', error_message: sendError })
              .eq('id', item.id);
            failedInBatch++;
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
          await supabase
            .from('dispatch_items')
            .update({ status: 'failed', error_message: errMsg })
            .eq('id', item.id);
          failedInBatch++;
        }

        // Random delay between messages
        const delayMs = randomDelay(
          dispatch.message_delay_min_seconds || 15,
          dispatch.message_delay_max_seconds || 45
        );
        if (hasTimeLeft(delayMs + 5000)) {
          await sleep(delayMs);
        }
      }

      // Update dispatch counts
      const { data: updatedCounts } = await supabase
        .from('dispatch_items')
        .select('status')
        .eq('dispatch_id', dispatchId);

      const totalSent = updatedCounts?.filter((c: any) => c.status === 'sent').length || 0;
      const totalFailed = updatedCounts?.filter((c: any) => c.status === 'failed').length || 0;
      const totalPending = updatedCounts?.filter((c: any) => c.status === 'pending').length || 0;

      const newStatus = totalPending > 0 ? 'processing' : 'completed';
      await supabase
        .from('message_dispatches')
        .update({ 
          sent_count: totalSent, 
          failed_count: totalFailed,
          status: newStatus,
          ...(newStatus === 'completed' ? { completed_at: new Date().toISOString() } : {}),
        })
        .eq('id', dispatchId);

      return new Response(JSON.stringify({
        success: true,
        completed: totalPending === 0,
        sentInBatch,
        failedInBatch,
        totalSent,
        totalFailed,
        totalPending,
        message: totalPending > 0
          ? `Lote processado: ${sentInBatch} enviados, ${failedInBatch} falhas. Restam ${totalPending} pendentes.`
          : `Disparo concluído! ${totalSent} enviados, ${totalFailed} falhas.`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ============ CANCEL ============
    if (action === 'cancel') {
      if (!dispatchId) {
        return new Response(JSON.stringify({ success: false, error: 'dispatchId obrigatório' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await supabase
        .from('message_dispatches')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', dispatchId)
        .eq('client_id', clientId);

      await supabase
        .from('dispatch_items')
        .update({ status: 'cancelled' })
        .eq('dispatch_id', dispatchId)
        .eq('status', 'pending');

      return new Response(JSON.stringify({ success: true, message: 'Disparo cancelado!' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============ STATUS ============
    if (action === 'status') {
      const { data: dispatches } = await supabase
        .from('message_dispatches')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(10);

      return new Response(JSON.stringify({ success: true, dispatches: dispatches || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Ação inválida' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in send-engagement-messages:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
