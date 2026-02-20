import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function base64UrlToBase64(base64url: string): string {
  return base64url.replace(/-/g, "+").replace(/_/g, "/");
}

function base64UrlDecode(base64url: string): Uint8Array {
  const base64 = base64UrlToBase64(base64url);
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(base64 + padding);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Import VAPID private key using JWK format (most reliable across runtimes)
async function importVapidPrivateKey(
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<CryptoKey> {
  // The VAPID public key is an uncompressed EC point: 0x04 || x (32 bytes) || y (32 bytes)
  const pubKeyBytes = base64UrlDecode(vapidPublicKey);

  // Skip the 0x04 uncompressed point prefix
  const x = base64UrlEncode(pubKeyBytes.slice(1, 33));
  const y = base64UrlEncode(pubKeyBytes.slice(33, 65));
  const d = vapidPrivateKey; // Already base64url encoded 32-byte scalar

  const jwk = {
    kty: "EC",
    crv: "P-256",
    x,
    y,
    d,
    ext: true,
  };

  return await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

async function generateVapidJWT(
  endpoint: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidEmail: string
): Promise<string> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 12 * 3600;

  const headerObj = { typ: "JWT", alg: "ES256" };
  const payloadObj = { aud: audience, exp, sub: `mailto:${vapidEmail}` };

  const encode = (obj: unknown): string => {
    const json = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(json);
    return base64UrlEncode(bytes);
  };

  const headerEncoded = encode(headerObj);
  const payloadEncoded = encode(payloadObj);
  const signingInput = `${headerEncoded}.${payloadEncoded}`;

  const cryptoKey = await importVapidPrivateKey(vapidPublicKey, vapidPrivateKey);

  const signatureBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const signatureEncoded = base64UrlEncode(new Uint8Array(signatureBuffer));
  return `${signingInput}.${signatureEncoded}`;
}

// Encrypt push payload using ECDH + AES-GCM (Web Push encryption per RFC 8291)
async function encryptPayload(
  payload: string,
  p256dh: string,
  auth: string
): Promise<{ encryptedBody: ArrayBuffer; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Generate ephemeral server key pair
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  // Import subscriber's public key
  const clientPublicKeyBytes = base64UrlDecode(p256dh);
  const clientPublicKey = await crypto.subtle.importKey(
    "raw",
    clientPublicKeyBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // Export server public key in raw format
  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeyPair.publicKey)
  );

  // Derive shared secret via ECDH
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientPublicKey },
    serverKeyPair.privateKey,
    256
  );

  const authBytes = base64UrlDecode(auth);

  // HKDF to derive PRK
  const hkdfSalt = await crypto.subtle.importKey("raw", authBytes, "HKDF", false, ["deriveBits"]);
  const hkdfInfo = new TextEncoder().encode("WebPush: info\0");
  const hkdfInfoWithKeys = new Uint8Array(hkdfInfo.length + clientPublicKeyBytes.length + serverPublicKeyRaw.length);
  hkdfInfoWithKeys.set(hkdfInfo);
  hkdfInfoWithKeys.set(clientPublicKeyBytes, hkdfInfo.length);
  hkdfInfoWithKeys.set(serverPublicKeyRaw, hkdfInfo.length + clientPublicKeyBytes.length);

  const sharedSecretKey = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    "HKDF",
    false,
    ["deriveBits"]
  );

  const prk = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: authBytes, info: hkdfInfoWithKeys },
    sharedSecretKey,
    256
  );

  const prkKey = await crypto.subtle.importKey("raw", prk, "HKDF", false, ["deriveBits"]);

  // Derive content encryption key
  const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
  const cekBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: cekInfo },
    prkKey,
    128
  );

  // Derive nonce
  const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");
  const nonceBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: nonceInfo },
    prkKey,
    96
  );

  const cekKey = await crypto.subtle.importKey("raw", cekBits, "AES-GCM", false, ["encrypt"]);

  // Encrypt with AES-GCM, adding padding delimiter (0x02 = last record)
  const payloadBytes = new TextEncoder().encode(payload);
  const paddedPayload = new Uint8Array(payloadBytes.length + 1);
  paddedPayload.set(payloadBytes);
  paddedPayload[payloadBytes.length] = 0x02; // padding delimiter

  const encryptedBody = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonceBits },
    cekKey,
    paddedPayload
  );

  return { encryptedBody, salt, serverPublicKey: serverPublicKeyRaw };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidEmail = Deno.env.get("VAPID_EMAIL") || "admin@example.com";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { client_id, title, message, url } = body;

    if (!client_id) {
      return new Response(JSON.stringify({ error: "client_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: client } = await supabase
      .from("clients")
      .select("id, name")
      .eq("id", client_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!client) {
      return new Response(JSON.stringify({ error: "Client not found or unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: subscriptions, error: subError } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("client_id", client_id);

    if (subError) throw subError;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "Nenhum apoiador com notificações ativas" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({ error: "VAPID keys not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const notificationPayload = JSON.stringify({
      title: title || `🎯 Nova missão de ${client.name}!`,
      body: message || "Há uma nova postagem para você interagir. Acesse o portal!",
      icon: "/favicon.ico",
      url: url || `/portal/${client_id}`,
      tag: `missao-${client_id}-${Date.now()}`,
    });

    let sent = 0;
    let failed = 0;
    const failedEndpoints: string[] = [];

    for (const sub of subscriptions) {
      try {
        const jwt = await generateVapidJWT(sub.endpoint, vapidPublicKey, vapidPrivateKey, vapidEmail);

        // Encrypt payload using Web Push encryption
        const { encryptedBody, salt, serverPublicKey } = await encryptPayload(
          notificationPayload,
          sub.p256dh,
          sub.auth
        );

        // Build the encrypted content per RFC 8291
        // Header: salt (16) + record_size (4) + key_length (1) + server_public_key (65) + encrypted_body
        const recordSize = encryptedBody.byteLength + 65 + 21; // approximation
        const header = new Uint8Array(16 + 4 + 1 + 65);
        header.set(salt, 0);
        // Record size (big-endian uint32) - use 4096 as standard
        header[16] = 0x00;
        header[17] = 0x00;
        header[18] = 0x10;
        header[19] = 0x00;
        header[20] = serverPublicKey.length; // key length = 65
        header.set(serverPublicKey, 21);

        const fullBody = new Uint8Array(header.length + encryptedBody.byteLength);
        fullBody.set(header, 0);
        fullBody.set(new Uint8Array(encryptedBody), header.length);

        const response = await fetch(sub.endpoint, {
          method: "POST",
          headers: {
            Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
            "Content-Type": "application/octet-stream",
            "Content-Encoding": "aes128gcm",
            TTL: "86400",
          },
          body: fullBody,
        });

        if (response.ok || response.status === 201) {
          sent++;
        } else if (response.status === 410 || response.status === 404) {
          failedEndpoints.push(sub.endpoint);
          failed++;
          console.log(`Subscription expired for ${sub.endpoint}, removing.`);
        } else {
          const responseText = await response.text();
          console.error(`Push failed for ${sub.endpoint}: ${response.status} - ${responseText}`);
          failed++;
        }
      } catch (err) {
        console.error(`Error sending push to ${sub.endpoint}:`, err);
        failed++;
      }
    }

    if (failedEndpoints.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("endpoint", failedEndpoints);
    }

    return new Response(
      JSON.stringify({ success: true, sent, failed, total: subscriptions.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
