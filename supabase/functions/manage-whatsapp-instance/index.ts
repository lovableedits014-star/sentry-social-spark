import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// This function is now simplified since WhatsApp instance management
// is handled by the external Bridge system.
// It only checks bridge connectivity status.

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

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    const { action, phone, message } = body;
    const adminClient = createClient(supabaseUrl, serviceKey);

    if (action === "check_bridge") {
      const { data: configs } = await adminClient
        .from("platform_config")
        .select("key, value")
        .in("key", ["whatsapp_bridge_url", "whatsapp_bridge_api_key"]);

      const configMap: Record<string, string> = {};
      (configs || []).forEach((c: any) => { configMap[c.key] = c.value; });

      const bridgeUrl = configMap.whatsapp_bridge_url;
      const bridgeApiKey = configMap.whatsapp_bridge_api_key;
      const configured = !!(bridgeUrl && bridgeApiKey);

      return new Response(
        JSON.stringify({ success: true, configured }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "test_send") {
      // Read bridge config from DB
      const { data: configs } = await adminClient
        .from("platform_config")
        .select("key, value")
        .in("key", ["whatsapp_bridge_url", "whatsapp_bridge_api_key"]);

      const configMap: Record<string, string> = {};
      (configs || []).forEach((c: any) => { configMap[c.key] = c.value; });

      const bridgeUrl = configMap.whatsapp_bridge_url;
      const bridgeApiKey = configMap.whatsapp_bridge_api_key;

      if (!bridgeUrl || !bridgeApiKey) {
        return new Response(
          JSON.stringify({ error: "Ponte API não configurada" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const bridgeRes = await fetch(bridgeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": bridgeApiKey,
        },
        body: JSON.stringify({ action: "send", phone, message }),
      });

      const bridgeData = await bridgeRes.json().catch(() => ({}));

      return new Response(
        JSON.stringify(bridgeData),
        { status: bridgeRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Ação não suportada." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("manage-whatsapp-instance error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
