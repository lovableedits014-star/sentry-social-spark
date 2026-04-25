import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_DELAY_MIN = 5;
const DEFAULT_DELAY_MAX = 15;
const DEFAULT_BATCH_PAUSE = 60;
const MAX_RUNTIME_MS = 55000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(minMs: number, maxMs: number) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

function cleanPhoneForBridge(raw: string): string {
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

const TRANSIENT_BRIDGE_STATUSES = new Set([502, 503, 504]);

async function fetchBridgeSend(params: { bridgeUrl: string; bridgeApiKey: string; phone: string; message: string }) {
  const { bridgeUrl, bridgeApiKey, phone, message } = params;

  for (let attempt = 0; attempt <= 2; attempt++) {
    const res = await fetch(bridgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": bridgeApiKey,
      },
      body: JSON.stringify({ action: "send", phone, message }),
    });

    const data = await res.json().catch(async () => ({ error: await res.text().catch(() => "Resposta inválida da ponte") }));

    if (TRANSIENT_BRIDGE_STATUSES.has(res.status) && attempt < 2) {
      console.warn(`Bridge send returned ${res.status}; retrying attempt ${attempt + 2}/3`);
      await sleep(1000 * (attempt + 1));
      continue;
    }

    return { res, data };
  }

  throw new Error("Falha inesperada ao comunicar com a ponte WhatsApp");
}

function getSendFailure(res: Response, data: any) {
  if (!res.ok) return data?.error || `Erro na ponte WhatsApp (status ${res.status})`;
  if (data?.success === false) return data?.error || "Ponte recusou o envio";
  if (data?.delivered === false) return data?.error || "Mensagem não entregue pelo WhatsApp";

  const hasDeliverySignal = data?.delivered === true || Boolean(data?.messageId || data?.message_id || data?.id || data?.key?.id);
  if (!hasDeliverySignal) return data?.error || "Ponte não confirmou entrega da mensagem";

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { client_id, titulo, mensagem, tipo, tag_filtro, batch_size, delay_min, delay_max, batch_pause } = await req.json();
    const BATCH_SIZE = batch_size || DEFAULT_BATCH_SIZE;
    const DELAY_MIN_MS = (delay_min || DEFAULT_DELAY_MIN) * 1000;
    const DELAY_MAX_MS = (delay_max || DEFAULT_DELAY_MAX) * 1000;
    const BATCH_PAUSE_MS = (batch_pause || DEFAULT_BATCH_PAUSE) * 1000;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Verify ownership and get bridge config
    const { data: clientData } = await adminClient
      .from("clients")
      .select("id, whatsapp_bridge_url, whatsapp_bridge_api_key")
      .eq("id", client_id)
      .eq("user_id", user.id)
      .single();
    if (!clientData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const bridgeUrl = clientData.whatsapp_bridge_url;
    const bridgeApiKey = clientData.whatsapp_bridge_api_key;

    if (!bridgeUrl || !bridgeApiKey) {
      return new Response(
        JSON.stringify({ error: "Ponte WhatsApp não configurada para este cliente. Contacte o administrador." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build recipient list based on tipo
    let recipients: { telefone: string; nome: string }[] = [];

    if (tipo === "funcionarios") {
      const { data } = await adminClient
        .from("funcionarios")
        .select("telefone, nome")
        .eq("client_id", client_id)
        .eq("status", "ativo")
        .not("telefone", "is", null);
      recipients = (data || []).map((r: any) => ({ telefone: r.telefone, nome: r.nome }));
    } else if (tipo === "contratados") {
      const { data } = await adminClient
        .from("contratados")
        .select("telefone, nome")
        .eq("client_id", client_id)
        .eq("status", "ativo")
        .not("telefone", "is", null);
      recipients = (data || []).map((r: any) => ({ telefone: r.telefone, nome: r.nome }));
    } else {
      if (tag_filtro) {
        const { data: tagData } = await adminClient
          .from("tags")
          .select("id")
          .eq("client_id", client_id)
          .eq("nome", tag_filtro)
          .single();

        if (tagData) {
          const { data: pessoaTagData } = await adminClient
            .from("pessoas_tags")
            .select("pessoa_id")
            .eq("tag_id", tagData.id);

          const pessoaIds = (pessoaTagData || []).map((pt: any) => pt.pessoa_id);
          if (pessoaIds.length > 0) {
            const { data } = await adminClient
              .from("pessoas")
              .select("telefone, nome")
              .eq("client_id", client_id)
              .in("id", pessoaIds)
              .not("telefone", "is", null);
            recipients = (data || []).map((r: any) => ({ telefone: r.telefone, nome: r.nome }));
          }
        }
      } else {
        const { data } = await adminClient
          .from("pessoas")
          .select("telefone, nome")
          .eq("client_id", client_id)
          .not("telefone", "is", null)
          .limit(2000);
        recipients = (data || []).map((r: any) => ({ telefone: r.telefone, nome: r.nome }));
      }
    }

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhum destinatário encontrado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create dispatch record
    const { data: dispatch, error: dispatchErr } = await adminClient
      .from("whatsapp_dispatches")
      .insert({
        client_id,
        tipo,
        titulo,
        mensagem_template: mensagem,
        total_destinatarios: recipients.length,
        tag_filtro,
        status: "enviando",
        started_at: new Date().toISOString(),
        batch_size: BATCH_SIZE,
        delay_min_seconds: Math.round(DELAY_MIN_MS / 1000),
        delay_max_seconds: Math.round(DELAY_MAX_MS / 1000),
        batch_pause_seconds: Math.round(BATCH_PAUSE_MS / 1000),
      })
      .select()
      .single();

    if (dispatchErr || !dispatch) {
      throw new Error("Failed to create dispatch: " + dispatchErr?.message);
    }

    // Create dispatch items
    const items = recipients.map((r) => ({
      dispatch_id: dispatch.id,
      telefone: r.telefone,
      nome: r.nome,
    }));

    for (let i = 0; i < items.length; i += 100) {
      await adminClient.from("whatsapp_dispatch_items").insert(items.slice(i, i + 100));
    }

    const processDispatch = async () => {
      let sent = 0;
      let failed = 0;

      for (let batch = 0; batch < Math.ceil(recipients.length / BATCH_SIZE); batch++) {
        if (Date.now() - startTime > MAX_RUNTIME_MS) {
          await adminClient.from("whatsapp_dispatches").update({
            enviados: sent,
            falhas: failed,
            status: sent > 0 ? "concluido" : "falhou",
            error_message: `Tempo limite atingido. ${sent} enviados de ${recipients.length}.`,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", dispatch.id);
          return;
        }

        const batchStart = batch * BATCH_SIZE;
        const batchItems = recipients.slice(batchStart, batchStart + BATCH_SIZE);

        for (const recipient of batchItems) {
          if (Date.now() - startTime > MAX_RUNTIME_MS) break;

          try {
            const personalizedMsg = mensagem.replace(/{nome}/g, recipient.nome);
            const phoneClean = cleanPhoneForBridge(recipient.telefone);
            console.log("[WhatsApp send-whatsapp-dispatch] phone recebido no body:", recipient.telefone);
            console.log("[WhatsApp send-whatsapp-dispatch] phone após sanitize:", phoneClean);
            console.log("[WhatsApp send-whatsapp-dispatch] phone enviado para whatsapp-bridge:", phoneClean);

            const { res: sendRes, data: sendData } = await fetchBridgeSend({
              bridgeUrl,
              bridgeApiKey,
              phone: phoneClean,
              message: personalizedMsg,
            });

            const failure = getSendFailure(sendRes, sendData);

            if (!failure) {
              sent++;
              await adminClient.from("whatsapp_dispatch_items")
                .update({ status: "enviado", enviado_em: new Date().toISOString() })
                .eq("dispatch_id", dispatch.id)
                .eq("telefone", recipient.telefone);
            } else {
              failed++;
              await adminClient.from("whatsapp_dispatch_items")
                .update({ status: "falha", erro: String(failure).slice(0, 200) })
                .eq("dispatch_id", dispatch.id)
                .eq("telefone", recipient.telefone);
            }
          } catch (err) {
            failed++;
            await adminClient.from("whatsapp_dispatch_items")
              .update({ status: "falha", erro: String(err).slice(0, 200) })
              .eq("dispatch_id", dispatch.id)
              .eq("telefone", recipient.telefone);
          }

          if ((sent + failed) % 5 === 0) {
            await adminClient.from("whatsapp_dispatches").update({
              enviados: sent,
              falhas: failed,
              updated_at: new Date().toISOString(),
            }).eq("id", dispatch.id);
          }

          await sleep(randomDelay(DELAY_MIN_MS, DELAY_MAX_MS));
        }

        if (batch < Math.ceil(recipients.length / BATCH_SIZE) - 1) {
          await sleep(BATCH_PAUSE_MS);
        }
      }

      await adminClient.from("whatsapp_dispatches").update({
        enviados: sent,
        falhas: failed,
        status: "concluido",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", dispatch.id);
    };

    if (typeof (globalThis as any).EdgeRuntime !== "undefined") {
      (globalThis as any).EdgeRuntime.waitUntil(processDispatch());
    } else {
      await processDispatch();
    }

    return new Response(
      JSON.stringify({ success: true, dispatch_id: dispatch.id, total: recipients.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-whatsapp-dispatch error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
