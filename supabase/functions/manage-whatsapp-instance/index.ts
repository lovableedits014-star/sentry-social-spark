import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BRIDGE_URL = "https://vxqvrsaxppbgxookyimz.supabase.co/functions/v1/whatsapp-bridge";

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

const isInvalidApiKeyResponse = (status: number, data: { error?: string } | null | undefined) =>
  status === 401 && typeof data?.error === "string" && data.error.toLowerCase().includes("invalid api key");

async function deleteExistingInstance(params: {
  adminClient: ReturnType<typeof createClient>;
  clientId: string;
  clientApiKey: string | undefined;
}) {
  const { adminClient, clientId, clientApiKey } = params;

  if (clientApiKey) {
    try {
      console.log(`Deleting existing instance for client ${clientId}...`);
      const res = await fetch(BRIDGE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": clientApiKey,
        },
        body: JSON.stringify({ action: "delete_instance" }),
      });
      console.log(`Bridge delete_instance response status: ${res.status}`);
    } catch (err) {
      console.error("Error deleting instance from bridge:", err);
    }
  }

  const { error: updateError } = await adminClient
    .from("clients")
    .update({
      whatsapp_bridge_url: null,
      whatsapp_bridge_api_key: null,
    } as any)
    .eq("id", clientId);

  if (updateError) {
    console.error("Error clearing client bridge credentials:", updateError);
  }
}

async function createClientInstance(params: {
  adminClient: ReturnType<typeof createClient>;
  bridgeToken: string | undefined;
  clientId: string;
  clientName?: string | null;
  providedName?: string | null;
  currentApiKey?: string | null;
}) {
  const { adminClient, bridgeToken, clientId, clientName, providedName, currentApiKey } = params;

  if (!bridgeToken) {
    return jsonResponse({ error: "Bridge token não configurado no servidor" }, 500);
  }

  // Ensure old instance is gone before creating a new one
  if (currentApiKey) {
    await deleteExistingInstance({ adminClient, clientId, clientApiKey: currentApiKey });
  }

  const instanceName = providedName || clientName || "WhatsApp Bot";

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
    return jsonResponse(
      { error: bridgeData.error || "Erro ao criar instância", details: bridgeData },
      bridgeRes.status,
    );
  }

  if (!bridgeData.api_key) {
    return jsonResponse(
      { error: "A ponte não retornou a api_key da instância", details: bridgeData },
      502,
    );
  }

  const { error: updateError } = await adminClient
    .from("clients")
    .update({
      whatsapp_bridge_url: BRIDGE_URL,
      whatsapp_bridge_api_key: bridgeData.api_key,
    } as any)
    .eq("id", clientId);

  if (updateError) {
    return jsonResponse(
      { error: "Erro ao salvar as credenciais da instância", details: updateError.message },
      500,
    );
  }

  return jsonResponse({
    success: true,
    qrcode: bridgeData.qrcode,
    instance: bridgeData.instance,
    recreated: true,
  });
}

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
      return await createClientInstance({
        adminClient,
        bridgeToken,
        clientId: resolvedClientId,
        clientName: clientConfig?.name,
        providedName: name,
        currentApiKey: clientApiKey,
      });
    }

    // === DISCONNECT ===
    if (action === "disconnect") {
      await deleteExistingInstance({
        adminClient,
        clientId: resolvedClientId,
        clientApiKey,
      });
      return jsonResponse({ success: true, message: "Instância deletada com sucesso" });
    }

    // === CHECK BRIDGE (legacy) ===
    if (action === "check_bridge") {
      const configured = !!(clientConfig?.whatsapp_bridge_url && clientApiKey);
      return jsonResponse({ success: true, configured });
    }

    // === ACTIONS THAT REQUIRE API KEY ===
    if (!clientApiKey) {
      if (action === "reconnect") {
        return await createClientInstance({
          adminClient,
          bridgeToken,
          clientId: resolvedClientId,
          clientName: clientConfig?.name,
          currentApiKey: null, // No old key since we already checked !clientApiKey
        });
      }

      return jsonResponse({ error: "Instância WhatsApp não configurada. Crie uma instância primeiro." }, 400);
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

    if (action === "reconnect" && isInvalidApiKeyResponse(bridgeRes.status, bridgeData)) {
      return await createClientInstance({
        adminClient,
        bridgeToken,
        clientId: resolvedClientId,
        clientName: clientConfig?.name,
      });
    }

    if (action === "instance_status" && isInvalidApiKeyResponse(bridgeRes.status, bridgeData)) {
      return jsonResponse({
        success: false,
        status: "disconnected",
        error: bridgeData.error,
        requires_reconnect: true,
      });
    }

    return jsonResponse(bridgeData, bridgeRes.status);
  } catch (err) {
    console.error("manage-whatsapp-instance error:", err);
    return jsonResponse({ error: err.message }, 500);
  }
});
