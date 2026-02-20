import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Base64url helpers ────────────────────────────────────────────────────────
function b64urlDecode(s: string): Uint8Array {
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(base64 + pad);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function b64urlEncode(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

function numToUint8Array(n: number, bytes: number): Uint8Array {
  const arr = new Uint8Array(bytes);
  for (let i = bytes - 1; i >= 0; i--) { arr[i] = n & 0xff; n >>= 8; }
  return arr;
}

// ─── VAPID JWT ────────────────────────────────────────────────────────────────
async function makeVapidJWT(
  endpoint: string,
  publicKey: string,
  privateKey: string,
  email: string,
): Promise<string> {
  // Import private key from JWK (derive x/y from public key bytes)
  const pubBytes = b64urlDecode(publicKey);
  const x = b64urlEncode(pubBytes.slice(1, 33));
  const y = b64urlEncode(pubBytes.slice(33, 65));
  const jwk = { kty: "EC", crv: "P-256", x, y, d: privateKey, ext: true };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);

  const { protocol, host } = new URL(endpoint);
  const aud = `${protocol}//${host}`;
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: unknown) => b64urlEncode(new TextEncoder().encode(JSON.stringify(o)));
  const header = enc({ typ: "JWT", alg: "ES256" });
  const payload = enc({ aud, exp: now + 43200, sub: `mailto:${email}` });
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${payload}`))
  );
  return `${header}.${payload}.${b64urlEncode(sig)}`;
}

// ─── RFC 8291 (aes128gcm) encryption ─────────────────────────────────────────
async function encryptPayload(
  plaintext: string,
  p256dh: string,
  auth: string,
): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Ephemeral server ECDH key pair
  const serverPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", serverPair.publicKey));

  // Client's public key
  const clientPubRaw = b64urlDecode(p256dh);
  const clientPub = await crypto.subtle.importKey("raw", clientPubRaw, { name: "ECDH", namedCurve: "P-256" }, false, []);

  // ECDH shared secret
  const sharedBits = await crypto.subtle.deriveBits({ name: "ECDH", public: clientPub }, serverPair.privateKey, 256);
  const sharedKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveBits"]);

  const authBytes = b64urlDecode(auth);

  // PRK via HKDF (RFC 8291 §3.3)
  const ikm = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: authBytes, info: concat(new TextEncoder().encode("WebPush: info\0"), clientPubRaw, serverPubRaw) },
    sharedKey,
    256,
  );
  const prkKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);

  // CEK (128 bit) and nonce (96 bit)
  const cekBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode("Content-Encoding: aes128gcm\0") },
    prkKey, 128,
  );
  const nonceBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode("Content-Encoding: nonce\0") },
    prkKey, 96,
  );

  const cek = await crypto.subtle.importKey("raw", cekBits, "AES-GCM", false, ["encrypt"]);

  // Pad + encrypt
  const msg = new TextEncoder().encode(plaintext);
  const padded = concat(msg, new Uint8Array([0x02])); // record delimiter
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonceBits }, cek, padded));

  // aes128gcm content encoding header: salt(16) + rs(4) + idlen(1) + server_pub(65)
  const rs = numToUint8Array(4096, 4);
  const header = concat(salt, rs, new Uint8Array([serverPubRaw.length]), serverPubRaw);
  return concat(header, ciphertext);
}

// ─── Send one push notification ───────────────────────────────────────────────
async function sendPush(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidEmail: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  const jwt = await makeVapidJWT(endpoint, vapidPublicKey, vapidPrivateKey, vapidEmail);
  const encrypted = await encryptPayload(payload, p256dh, auth);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `vapid t=${jwt}, k=${vapidPublicKey}`,
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "TTL": "86400",
    },
    body: encrypted,
  });

  const body = await res.text().catch(() => "");
  return { ok: res.ok || res.status === 201, status: res.status, body };
}

// ─── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
    const vapidEmail = Deno.env.get("VAPID_EMAIL") || "admin@example.com";

    if (!vapidPublicKey || !vapidPrivateKey) {
      return json({ error: "VAPID keys not configured" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { client_id, title, message, url } = await req.json();
    if (!client_id) return json({ error: "client_id required" }, 400);

    // Verify ownership
    const { data: client } = await supabase
      .from("clients").select("id, name").eq("id", client_id).eq("user_id", user.id).maybeSingle();
    if (!client) return json({ error: "Client not found or unauthorized" }, 403);

    // Load subscriptions
    const { data: subs, error: subError } = await supabase
      .from("push_subscriptions").select("*").eq("client_id", client_id);
    if (subError) throw subError;
    if (!subs || subs.length === 0) {
      return json({ success: true, sent: 0, message: "Nenhum apoiador com notificações ativas" });
    }

    const payload = JSON.stringify({
      title: title || `🎯 Nova missão de ${client.name}!`,
      body: message || "Há uma nova postagem para você interagir. Acesse o portal!",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      url: url || `/portal/${client_id}`,
      tag: `missao-${client_id}-${Date.now()}`,
    });

    let sent = 0;
    let failed = 0;
    const expiredEndpoints: string[] = [];

    for (const sub of subs) {
      try {
        const result = await sendPush(
          sub.endpoint,
          sub.p256dh,
          sub.auth,
          payload,
          vapidPublicKey,
          vapidPrivateKey,
          vapidEmail,
        );

        if (result.ok) {
          sent++;
          console.log(`✅ Sent to ${sub.endpoint.slice(0, 60)}...`);
        } else if (result.status === 410 || result.status === 404) {
          expiredEndpoints.push(sub.endpoint);
          failed++;
          console.log(`🗑️  Expired subscription removed: ${result.status}`);
        } else {
          failed++;
          console.error(`❌ Push failed ${result.status}: ${result.body.slice(0, 200)}`);
        }
      } catch (err) {
        failed++;
        console.error(`❌ Exception sending push:`, err);
      }
    }

    // Cleanup expired subscriptions
    if (expiredEndpoints.length > 0) {
      await supabase.from("push_subscriptions").delete().in("endpoint", expiredEndpoints);
    }

    return json({ success: true, sent, failed, total: subs.length });
  } catch (error) {
    console.error("Unhandled error:", error);
    return json({ error: String(error) }, 500);
  }
});
