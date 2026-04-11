import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BRIDGE_URL = "https://vxqvrsaxppbgxookyimz.supabase.co/functions/v1/whatsapp-bridge";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const bridgeToken = Deno.env.get("WHATSAPP_BRIDGE_TOKEN");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    const { action, phone, message, client_id, name } = body;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Resolve client_id
    let resolvedClientId = client_id;
    if (!resolvedClientId) {
      const { data: clientData } = await adminClient
        .from("clients")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      resolvedClientId = clientData?.id;
    }

    if (!resolvedClientId) {
      return new Response(
        JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get per-client bridge config
    const { data: clientConfig } = await adminClient
      .from("clients")
      .select("name, whatsapp_bridge_url, whatsapp_bridge_api_key")
      .eq("id", resolvedClientId)
      .single();

    const clientApiKey = clientConfig?.whatsapp_bridge_api_key;

    // === CREATE INSTANCE ===
    if (action === "create_instance") {
      if (!bridgeToken) {
        return new Response(
          JSON.stringify({ error: "Bridge token não configurado no servidor" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const instanceName = name || clientConfig?.name || "WhatsApp Bot";

      const bridgeRes = await fetch(BRIDGE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Bridge-Token": bridgeToken,
        },
        body: JSON.stringify({ action: "create_instance", name: instanceName }),
      });

      const bridgeData = await bridgeRes.json().catch(() => ({}));

      if (!bridgeRes.ok || !bridgeData.success) {
        return new Response(
          JSON.stringify({ error: bridgeData.error || "Erro ao criar instância", details: bridgeData }),
          { status: bridgeRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Save the api_key and bridge URL to client record
      await adminClient
        .from("clients")
        .update({
          whatsapp_bridge_url: BRIDGE_URL,
          whatsapp_bridge_api_key: bridgeData.api_key,
        } as any)
        .eq("id", resolvedClientId);

      return new Response(
        JSON.stringify({
          success: true,
          qrcode: bridgeData.qrcode,
          instance: bridgeData.instance,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === CHECK BRIDGE (legacy) ===
    if (action === "check_bridge") {
      const configured = !!(clientConfig?.whatsapp_bridge_url && clientApiKey);
      return new Response(
        JSON.stringify({ success: true, configured }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === ACTIONS THAT REQUIRE API KEY ===
    if (!clientApiKey) {
      return new Response(
        JSON.stringify({ error: "Instância WhatsApp não configurada. Crie uma instância primeiro." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Proxy all other actions to bridge with X-Api-Key
    const proxyBody: any = { action };
    if (phone) proxyBody.phone = phone;
    if (message) proxyBody.message = message;

    const bridgeRes = await fetch(BRIDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": clientApiKey,
      },
      body: JSON.stringify(proxyBody),
    });

    const bridgeData = await bridgeRes.json().catch(() => ({}));

    return new Response(
      JSON.stringify(bridgeData),
      { status: bridgeRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("manage-whatsapp-instance error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
