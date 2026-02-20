import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Concurrency & limits ─────────────────────────────────────────────────────
const CONCURRENCY = 20;       // simultaneous push requests per job
const DB_PAGE_SIZE = 500;     // rows per DB page (well under 1000 limit)
const MAX_RUNTIME_MS = 50_000; // stop gracefully 10s before 60s timeout

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

// ─── VAPID JWT — cached per audience ─────────────────────────────────────────
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

// ─── RFC 8291 encryption ──────────────────────────────────────────────────────
async function encryptPayload(plaintext: string, p256dh: string, auth: string): Promise<Uint8Array> {
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
async function sendOnePush(
  endpoint: string, p256dh: string, auth: string, payload: string,
  vapidPublicKey: string, vapidPrivateKey: string, vapidEmail: string,
): Promise<{ ok: boolean; status: number }> {
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
  await res.text().catch(() => ""); // consume body
  return { ok: res.ok || res.status === 201, status: res.status };
}

// ─── Core processing function (runs async via waitUntil) ──────────────────────
async function processJob(
  jobId: string,
  clientId: string,
  payloadStr: string,
  supabase: ReturnType<typeof createClient>,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidEmail: string,
) {
  const startTime = Date.now();

  // Mark as processing
  await supabase.from("push_dispatch_jobs").update({
    status: "processing",
    started_at: new Date().toISOString(),
  }).eq("id", jobId);

  // Paginate through ALL subscriptions (bypasses 1000-row limit)
  const allSubs: any[] = [];
  let page = 0;
  while (true) {
    const { data: batch } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("client_id", clientId)
      .range(page * DB_PAGE_SIZE, (page + 1) * DB_PAGE_SIZE - 1);
    if (!batch || batch.length === 0) break;
    allSubs.push(...batch);
    if (batch.length < DB_PAGE_SIZE) break;
    page++;
  }

  // Update total count immediately
  await supabase.from("push_dispatch_jobs").update({
    total_subscribers: allSubs.length,
  }).eq("id", jobId);

  if (allSubs.length === 0) {
    await supabase.from("push_dispatch_jobs").update({
      status: "done",
      completed_at: new Date().toISOString(),
      elapsed_seconds: 0,
    }).eq("id", jobId);
    return;
  }

  let sent = 0, failed = 0, skipped = 0;
  const expiredEndpoints: string[] = [];

  // Process in parallel batches of CONCURRENCY
  for (let i = 0; i < allSubs.length; i += CONCURRENCY) {
    // Graceful timeout: stop if close to limit
    if (Date.now() - startTime > MAX_RUNTIME_MS) {
      skipped += allSubs.length - i;
      console.warn(`⏱️ Timeout guard: skipping ${allSubs.length - i} remaining`);
      break;
    }

    const chunk = allSubs.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map(async (sub) => {
        try {
          return await sendOnePush(
            sub.endpoint, sub.p256dh, sub.auth, payloadStr,
            vapidPublicKey, vapidPrivateKey, vapidEmail,
          );
        } catch {
          return { ok: false, status: 0 };
        }
      })
    );

    for (const r of results) {
      const result = r.status === "fulfilled" ? r.value : { ok: false, status: 0 };
      if (result.ok) {
        sent++;
      } else if (result.status === 410 || result.status === 404) {
        expiredEndpoints.push(chunk[results.indexOf(r)]?.endpoint);
        failed++;
      } else {
        failed++;
      }
    }

    // Update progress every 5 batches (every 100 subscribers)
    if (i % (CONCURRENCY * 5) === 0) {
      await supabase.from("push_dispatch_jobs").update({
        sent_count: sent,
        failed_count: failed,
        skipped_count: skipped,
      }).eq("id", jobId);
    }
  }

  // Cleanup expired subscriptions
  if (expiredEndpoints.length > 0) {
    await supabase.from("push_subscriptions").delete().in("endpoint", expiredEndpoints);
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const finalStatus = skipped > 0 ? "partial" : "done";

  await supabase.from("push_dispatch_jobs").update({
    status: finalStatus,
    sent_count: sent,
    failed_count: failed,
    skipped_count: skipped,
    expired_removed: expiredEndpoints.length,
    elapsed_seconds: elapsed,
    completed_at: new Date().toISOString(),
  }).eq("id", jobId);

  console.log(`✅ Job ${jobId} done in ${elapsed}s: sent=${sent} failed=${failed} skipped=${skipped} expired=${expiredEndpoints.length}`);
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

    // Use service role to bypass RLS when updating job status
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth: validate the calling user
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

    // ── QUEUE: Create job record first ──────────────────────────────────────
    const { data: job, error: jobError } = await supabase
      .from("push_dispatch_jobs")
      .insert({
        client_id,
        user_id: user.id,
        title: title || `🎯 Nova missão de ${client.name}!`,
        message: message || "Há uma nova postagem para você interagir. Acesse o portal!",
        url: url || `/portal/${client_id}`,
        status: "pending",
      })
      .select("id")
      .single();

    if (jobError || !job) {
      console.error("Failed to create job:", jobError);
      return json({ error: "Falha ao criar job de envio" }, 500);
    }

    const payloadStr = JSON.stringify({
      title: title || `🎯 Nova missão de ${client.name}!`,
      body: message || "Há uma nova postagem para você interagir. Acesse o portal!",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      url: url || `/portal/${client_id}`,
      tag: `missao-${client_id}-${Date.now()}`,
    });

    // ── ASYNC: Process in background, return immediately ────────────────────
    // EdgeRuntime.waitUntil keeps the worker alive after response is sent
    // This allows 10 concurrent users to each get an instant response
    // while their jobs process independently without blocking each other
    (globalThis as any).EdgeRuntime?.waitUntil(
      processJob(job.id, client_id, payloadStr, supabase, vapidPublicKey, vapidPrivateKey, vapidEmail)
        .catch(async (err) => {
          console.error(`Job ${job.id} failed:`, err);
          await supabase.from("push_dispatch_jobs").update({
            status: "failed",
            error_message: String(err),
            completed_at: new Date().toISOString(),
          }).eq("id", job.id);
        })
    );

    // If EdgeRuntime.waitUntil not available (local dev), process inline
    if (!(globalThis as any).EdgeRuntime) {
      processJob(job.id, client_id, payloadStr, supabase, vapidPublicKey, vapidPrivateKey, vapidEmail)
        .catch(console.error);
    }

    // Return immediately with job_id — frontend polls for progress
    return json({
      success: true,
      job_id: job.id,
      message: "Envio iniciado! Acompanhe o progresso na tela.",
    });

  } catch (error) {
    console.error("Unhandled error:", error);
    return json({ error: String(error) }, 500);
  }
});
