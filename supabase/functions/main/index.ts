// Roteador "main-service" para edge-runtime self-hosted (EasyPanel).
//
// O edge-runtime é iniciado com:
//   edge-runtime start --main-service /home/deno/functions/main
//
// Nesse modo, TODAS as requisições chegam aqui. Este arquivo extrai o
// nome da function do path (/<function-name>/...) e a executa em um
// worker isolado, preservando a estrutura padrão de cada function em
// supabase/functions/<nome>/index.ts (sem precisar alterá-las).
//
// Allowlist explícito: só roteia para as 8 functions da Fase 1.
// Para liberar mais functions depois, basta adicionar o nome ao Set.

const ALLOWED_FUNCTIONS = new Set<string>([
  "register-supporter",
  "register-contratado",
  "register-funcionario",
  "link-supporter-account",
  "create-team-user",
  "calculate-ied",
  "check-alerts",
  "resolve-whatsapp-link",
]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// `EdgeRuntime` é um global injetado pelo runtime self-hosted.
// Tipamos de forma frouxa para não exigir lib types extras.
// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: any;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // Path típico no Kong: /functions/v1/<function-name>/...
  // Path direto no runtime: /<function-name>/...
  // Pegamos o primeiro segmento "útil" depois de qualquer prefixo conhecido.
  const segments = url.pathname.split("/").filter(Boolean);

  // Remove prefixos opcionais ("functions", "v1") se vierem do Kong.
  while (segments.length && (segments[0] === "functions" || segments[0] === "v1")) {
    segments.shift();
  }

  const functionName = segments[0];

  if (!functionName) {
    return jsonResponse(200, {
      ok: true,
      service: "edge-runtime main router",
      allowed: Array.from(ALLOWED_FUNCTIONS),
    });
  }

  // Healthcheck simples
  if (functionName === "_health") {
    return jsonResponse(200, { ok: true });
  }

  if (!ALLOWED_FUNCTIONS.has(functionName)) {
    return jsonResponse(404, {
      error: `Function "${functionName}" não encontrada ou não habilitada.`,
      allowed: Array.from(ALLOWED_FUNCTIONS),
    });
  }

  try {
    // Cria/reutiliza um worker isolado para a function alvo.
    // O runtime self-hosted expõe `EdgeRuntime.userWorkers.fetch`, que
    // carrega `supabase/functions/<name>/index.ts` em um isolate próprio.
    const servicePath = `/home/deno/functions/${functionName}`;

    const memoryLimitMb = 256;
    const workerTimeoutMs = 60_000; // 60s, igual ao limite padrão
    const noModuleCache = false;
    const importMapPath = null;
    const envVarsObj = Deno.env.toObject();
    const envVars = Object.entries(envVarsObj);

    const worker = await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb,
      workerTimeoutMs,
      noModuleCache,
      importMapPath,
      envVars,
    });

    // Reescreve o path para que a function alvo veja "/" como raiz,
    // mantendo querystring e segmentos extras.
    const innerPath = "/" + segments.slice(1).join("/");
    const innerUrl = new URL(innerPath + url.search, url.origin);

    const innerReq = new Request(innerUrl.toString(), {
      method: req.method,
      headers: req.headers,
      body:
        req.method === "GET" || req.method === "HEAD"
          ? undefined
          : await req.arrayBuffer(),
    });

    const res = await worker.fetch(innerReq);

    // Garante CORS mesmo se a function alvo não tiver setado.
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(corsHeaders)) {
      if (!headers.has(k)) headers.set(k, v);
    }

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[main-router] erro ao executar "${functionName}":`, message);
    return jsonResponse(500, {
      error: "Falha ao executar function",
      function: functionName,
      detail: message,
    });
  }
});