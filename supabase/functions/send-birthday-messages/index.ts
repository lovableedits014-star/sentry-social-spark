import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Get all clients with birthday config enabled
    const { data: configs } = await admin
      .from("whatsapp_birthday_config")
      .select("*")
      .eq("enabled", true);

    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ message: "No birthday configs enabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get UAZAPI config
    const { data: platformConfigs } = await admin
      .from("platform_config")
      .select("key, value")
      .in("key", ["uazapi_url", "uazapi_admin_token"]);
    const configMap: Record<string, string> = {};
    (platformConfigs || []).forEach((c: any) => { configMap[c.key] = c.value; });

    const uazapiUrl = configMap.uazapi_url;
    if (!uazapiUrl) {
      return new Response(JSON.stringify({ error: "UAZAPI not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalSent = 0;
    let totalFailed = 0;

    for (const config of configs) {
      const clientId = config.client_id;

      // Get WhatsApp instance for this client
      const { data: instance } = await admin
        .from("whatsapp_instances")
        .select("instance_name, instance_token, status")
        .eq("client_id", clientId)
        .single();

      if (!instance || instance.status !== "connected") continue;

      // Find people with birthday today (month + day match)
      const today = new Date();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      const birthdayPattern = `%-${month}-${day}%`;

      const { data: aniversariantes } = await admin
        .from("pessoas")
        .select("id, nome, telefone, data_nascimento")
        .eq("client_id", clientId)
        .not("telefone", "is", null)
        .not("data_nascimento", "is", null)
        .like("data_nascimento", birthdayPattern);

      if (!aniversariantes || aniversariantes.length === 0) continue;

      // Check which ones already received today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: alreadySent } = await admin
        .from("whatsapp_birthday_log")
        .select("pessoa_id")
        .eq("client_id", clientId)
        .eq("status", "enviado")
        .gte("enviado_em", todayStart.toISOString());

      const sentIds = new Set((alreadySent || []).map((s: any) => s.pessoa_id));
      const toSend = aniversariantes.filter((p: any) => !sentIds.has(p.id));

      if (toSend.length === 0) continue;

      const instanceToken = instance.instance_token || configMap.uazapi_admin_token;
      const instanceName = instance.instance_name;

      for (const pessoa of toSend) {
        try {
          const personalizedMsg = config.mensagem_template.replace(/{nome}/g, pessoa.nome);
          const phoneClean = pessoa.telefone.replace(/\D/g, "");

          // Send image first if configured
          if (config.image_url) {
            await fetch(`${uazapiUrl}/message/sendImage/${instanceName}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: instanceToken },
              body: JSON.stringify({
                number: phoneClean,
                imageUrl: config.image_url,
                caption: personalizedMsg,
              }),
            });
          } else {
            // Text only
            await fetch(`${uazapiUrl}/message/sendText/${instanceName}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: instanceToken },
              body: JSON.stringify({
                number: phoneClean,
                text: personalizedMsg,
              }),
            });
          }

          // Log success
          await admin.from("whatsapp_birthday_log").insert({
            client_id: clientId,
            pessoa_id: pessoa.id,
            pessoa_nome: pessoa.nome,
            telefone: pessoa.telefone,
            status: "enviado",
          });
          totalSent++;
        } catch (err) {
          await admin.from("whatsapp_birthday_log").insert({
            client_id: clientId,
            pessoa_id: pessoa.id,
            pessoa_nome: pessoa.nome,
            telefone: pessoa.telefone,
            status: "falha",
            erro: String(err).slice(0, 200),
          });
          totalFailed++;
        }

        // Conservative delay between birthday messages (8-15s)
        await sleep(Math.floor(Math.random() * 7000) + 8000);
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent: totalSent, failed: totalFailed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-birthday-messages error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
