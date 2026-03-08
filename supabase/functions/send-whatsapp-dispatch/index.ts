import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Default conservative policy (overridable via request body)
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_DELAY_MIN = 5; // seconds
const DEFAULT_DELAY_MAX = 15;
const DEFAULT_BATCH_PAUSE = 60;
const MAX_RUNTIME_MS = 55000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay() {
  return Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS + 1)) + DELAY_MIN_MS;
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

    // Verify user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { client_id, titulo, mensagem, tipo, tag_filtro } = await req.json();
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Verify ownership
    const { data: clientData } = await adminClient
      .from("clients")
      .select("id")
      .eq("id", client_id)
      .eq("user_id", user.id)
      .single();
    if (!clientData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    // Get UAZAPI config
    const { data: configs } = await adminClient
      .from("platform_config")
      .select("key, value")
      .in("key", ["uazapi_url", "uazapi_admin_token"]);
    const configMap: Record<string, string> = {};
    (configs || []).forEach((c: any) => { configMap[c.key] = c.value; });

    // Get instance
    const { data: instance } = await adminClient
      .from("whatsapp_instances")
      .select("instance_name, instance_token, status")
      .eq("client_id", client_id)
      .single();

    if (!instance || instance.status !== "connected") {
      return new Response(
        JSON.stringify({ error: "WhatsApp não conectado" }),
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
      // Pessoas - optionally filtered by tag
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

    // Insert items in batches of 100
    for (let i = 0; i < items.length; i += 100) {
      await adminClient.from("whatsapp_dispatch_items").insert(items.slice(i, i + 100));
    }

    // Use EdgeRuntime.waitUntil if available to process in background
    const processDispatch = async () => {
      const uazapiUrl = configMap.uazapi_url;
      const instanceName = instance.instance_name;
      const instanceToken = instance.instance_token || configMap.uazapi_admin_token;

      let sent = 0;
      let failed = 0;

      for (let batch = 0; batch < Math.ceil(recipients.length / BATCH_SIZE); batch++) {
        // Check runtime limit
        if (Date.now() - startTime > MAX_RUNTIME_MS) {
          // Graceful stop - update dispatch as partial
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
            const phoneClean = recipient.telefone.replace(/\D/g, "");

            const sendRes = await fetch(`${uazapiUrl}/message/sendText/${instanceName}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: instanceToken,
              },
              body: JSON.stringify({
                number: phoneClean,
                text: personalizedMsg,
              }),
            });

            if (sendRes.ok) {
              sent++;
              await adminClient.from("whatsapp_dispatch_items")
                .update({ status: "enviado", enviado_em: new Date().toISOString() })
                .eq("dispatch_id", dispatch.id)
                .eq("telefone", recipient.telefone);
            } else {
              const errBody = await sendRes.text();
              failed++;
              await adminClient.from("whatsapp_dispatch_items")
                .update({ status: "falha", erro: errBody.slice(0, 200) })
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

          // Update progress every 5 messages
          if ((sent + failed) % 5 === 0) {
            await adminClient.from("whatsapp_dispatches").update({
              enviados: sent,
              falhas: failed,
              updated_at: new Date().toISOString(),
            }).eq("id", dispatch.id);
          }

          // Delay between messages
          await sleep(randomDelay());
        }

        // Batch pause (skip on last batch)
        if (batch < Math.ceil(recipients.length / BATCH_SIZE) - 1) {
          await sleep(BATCH_PAUSE_MS);
        }
      }

      // Final update
      await adminClient.from("whatsapp_dispatches").update({
        enviados: sent,
        falhas: failed,
        status: "concluido",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", dispatch.id);
    };

    // Process in background if EdgeRuntime available
    if (typeof (globalThis as any).EdgeRuntime !== "undefined") {
      (globalThis as any).EdgeRuntime.waitUntil(processDispatch());
    } else {
      // Fallback: process synchronously (limited by timeout)
      await processDispatch();
    }

    return new Response(
      JSON.stringify({ success: true, dispatch_id: dispatch.id, total: recipients.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-whatsapp-dispatch error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
