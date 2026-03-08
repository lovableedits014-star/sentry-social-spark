import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Verify user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { action, client_id } = await req.json();
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Verify user owns this client
    const { data: clientData } = await adminClient
      .from("clients")
      .select("id, name")
      .eq("id", client_id)
      .eq("user_id", user.id)
      .single();

    if (!clientData) {
      return new Response(JSON.stringify({ error: "Client not found" }), { status: 403, headers: corsHeaders });
    }

    // Get UAZAPI config
    const { data: configs } = await adminClient
      .from("platform_config")
      .select("key, value")
      .in("key", ["uazapi_url", "uazapi_admin_token"]);

    const configMap: Record<string, string> = {};
    (configs || []).forEach((c: any) => { configMap[c.key] = c.value; });

    const uazapiUrl = configMap.uazapi_url;
    const uazapiToken = configMap.uazapi_admin_token;

    if (!uazapiUrl || !uazapiToken) {
      return new Response(
        JSON.stringify({ error: "UAZAPI não configurada. Contacte o administrador." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "create") {
      const instanceName = `client_${client_id.replace(/-/g, "").slice(0, 16)}`;

      // Create instance via UAZAPI
      const createRes = await fetch(`${uazapiUrl}/instance/init`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: uazapiToken,
        },
        body: JSON.stringify({ instanceName }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) {
        throw new Error(`UAZAPI error: ${JSON.stringify(createData)}`);
      }

      const instanceToken = createData.token || createData.apikey || createData.instance?.token || "";

      // Get QR code
      let qrCode = null;
      try {
        const qrRes = await fetch(`${uazapiUrl}/instance/qr/${instanceName}`, {
          headers: { apikey: uazapiToken },
        });
        const qrData = await qrRes.json();
        qrCode = qrData.qrcode || qrData.base64 || qrData.data || null;
      } catch {
        // QR might not be immediately available
      }

      // Save to database
      await adminClient.from("whatsapp_instances").upsert({
        client_id,
        instance_name: instanceName,
        instance_token: instanceToken,
        status: qrCode ? "qr_pending" : "disconnected",
        qr_code: qrCode,
        updated_at: new Date().toISOString(),
      }, { onConflict: "client_id" });

      return new Response(
        JSON.stringify({ success: true, instance_name: instanceName }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "qr") {
      const { data: inst } = await adminClient
        .from("whatsapp_instances")
        .select("instance_name")
        .eq("client_id", client_id)
        .single();

      if (!inst) {
        return new Response(JSON.stringify({ error: "No instance" }), { status: 404, headers: corsHeaders });
      }

      const qrRes = await fetch(`${uazapiUrl}/instance/qr/${inst.instance_name}`, {
        headers: { apikey: uazapiToken },
      });
      const qrData = await qrRes.json();
      const qrCode = qrData.qrcode || qrData.base64 || qrData.data || null;

      await adminClient.from("whatsapp_instances")
        .update({ qr_code: qrCode, status: "qr_pending", updated_at: new Date().toISOString() })
        .eq("client_id", client_id);

      return new Response(
        JSON.stringify({ success: true, qr_code: qrCode }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "status") {
      const { data: inst } = await adminClient
        .from("whatsapp_instances")
        .select("instance_name")
        .eq("client_id", client_id)
        .single();

      if (!inst) {
        return new Response(JSON.stringify({ error: "No instance" }), { status: 404, headers: corsHeaders });
      }

      const statusRes = await fetch(`${uazapiUrl}/instance/connectionState/${inst.instance_name}`, {
        headers: { apikey: uazapiToken },
      });
      const statusData = await statusRes.json();
      const connected = statusData.state === "open" || statusData.instance?.state === "open";

      await adminClient.from("whatsapp_instances")
        .update({
          status: connected ? "connected" : "disconnected",
          phone_number: statusData.instance?.phoneNumber || null,
          updated_at: new Date().toISOString(),
        })
        .eq("client_id", client_id);

      return new Response(
        JSON.stringify({ success: true, connected }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: corsHeaders });
  } catch (err) {
    console.error("manage-whatsapp-instance error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
