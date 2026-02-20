import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Concurrency control ──────────────────────────────────────────────────────
const CONCURRENCY = 20;       // simultaneous push requests
const BATCH_SIZE = 100;       // rows per DB page
const MAX_RUNTIME_MS = 50_000; // leave 10s buffer before 60s timeout

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

// ─── VAPID JWT — cached per audience to avoid redundant crypto ops ─────────────
const jwtCache = new Map<string, { jwt: string; exp: number }>();

async function makeVapidJWT(
  endpoint: string,
  publicKey: string,
  privateKey: string,
  email: string,
): Promise<string> {
  const { protocol, host } = new URL(endpoint);
  const aud = `${protocol}//${host}`;
  const cached = jwtCache.get(aud);
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp > now + 60) return cached.jwt;

  const pubBytes = b64urlDecode(publicKey);
  const x = b64urlEncode(pubBytes.slice(1, 33));
  const y = b64urlEncode(pubBytes.slice(33, 65));
  const jwk = { kty: "EC", crv: "P-256", x, y, d: privateKey, ext: true };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);

  const exp = now + 43200;
  const enc = (o: unknown) => b64urlEncode(new TextEncoder().encode(JSON.stringify(o)));
  const header = enc({ typ: "JWT", alg: "ES256" });
  const payload = enc({ aud, exp, sub: `mailto:${email}` });
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${payload}`))
  );
  const jwt = `${header}.${payload}.${b64urlEncode(sig)}`;
  jwtCache.set(aud, { jwt, exp });
  return jwt;
}

// ─── RFC 8291 (aes128gcm) encryption ─────────────────────────────────────────
async function encryptPayload(
  plaintext: string,
  p256dh: string,
  auth: string,
): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const serverPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", serverPair.publicKey));
  const clientPubRaw = b64urlDecode(p256dh);
  const clientPub = await crypto.subtle.importKey("raw", clientPubRaw, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sharedBits = await crypto.subtle.deriveBits({ name: "ECDH", public: clientPub }, serverPair.privateKey, 256);
  const sharedKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveBits"]);
  const authBytes = b64urlDecode(auth);
  const ikm = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: authBytes, info: concat(new TextEncoder().encode("WebPush: info\0"), clientPubRaw, serverPubRaw) },
    sharedKey, 256,
  );
  const prkKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const cekBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode("Content-Encoding: aes128gcm\0") },
    prkKey, 128,
  );
  const nonceBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode("Content-Encoding: nonce\0") },
    prkKey, 96,
  );
  const cek = await crypto.subtle.importKey("raw", cekBits, "AES-GCM", false, ["encrypt"]);
  const msg = new TextEncoder().encode(plaintext);
  const padded = concat(msg, new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonceBits }, cek, padded));
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

// ─── Parallel batch processor ─────────────────────────────────────────────────
async function processInParallel<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.allSettled(chunk.map(fn));
    for (const r of chunkResults) {
      if (r.status === "fulfilled") results.push(r.value);
    }
  }
  return results;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
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

    // Load ALL subscriptions with pagination to bypass 1000-row limit
    const allSubs: any[] = [];
    let page = 0;
    while (true) {
      const { data: batch, error: subError } = await supabase
        .from("push_subscriptions")
        .select("*")
        .eq("client_id", client_id)
        .range(page * BATCH_SIZE, (page + 1) * BATCH_SIZE - 1);
      if (subError) throw subError;
      if (!batch || batch.length === 0) break;
      allSubs.push(...batch);
      if (batch.length < BATCH_SIZE) break;
      page++;
    }

    if (allSubs.length === 0) {
      return json({ success: true, sent: 0, message: "Nenhum apoiador com notificações ativas" });
    }

    console.log(`📤 Sending to ${allSubs.length} subscriptions (concurrency=${CONCURRENCY})`);

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
    let skipped = 0;
    const expiredEndpoints: string[] = [];

    type PushResult = { ok: boolean; status: number; endpoint: string };

    const results = await processInParallel<any, PushResult>(
      allSubs,
      CONCURRENCY,
      async (sub) => {
        // Graceful timeout: stop processing new items if we're close to limit
        if (Date.now() - startTime > MAX_RUNTIME_MS) {
          return { ok: false, status: -1, endpoint: sub.endpoint };
        }
        try {
          const result = await sendPush(
            sub.endpoint, sub.p256dh, sub.auth, payload,
            vapidPublicKey, vapidPrivateKey, vapidEmail,
          );
          return { ...result, endpoint: sub.endpoint };
        } catch (err) {
          console.error(`❌ Exception:`, err);
          return { ok: false, status: 0, endpoint: sub.endpoint };
        }
      }
    );

    for (const r of results) {
      if (r.status === -1) {
        skipped++;
      } else if (r.ok) {
        sent++;
      } else if (r.status === 410 || r.status === 404) {
        expiredEndpoints.push(r.endpoint);
        failed++;
      } else {
        failed++;
      }
    }

    // Cleanup expired subscriptions in one query
    if (expiredEndpoints.length > 0) {
      await supabase.from("push_subscriptions").delete().in("endpoint", expiredEndpoints);
      console.log(`🗑️ Removed ${expiredEndpoints.length} expired subscriptions`);
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`✅ Done in ${elapsed}s: sent=${sent} failed=${failed} skipped=${skipped} expired=${expiredEndpoints.length}`);

    return json({
      success: true,
      sent,
      failed,
      skipped,
      expired_removed: expiredEndpoints.length,
      total: allSubs.length,
      elapsed_seconds: elapsed,
    });
  } catch (error) {
    console.error("Unhandled error:", error);
    return json({ error: String(error) }, 500);
  }
});
