// Roteador "main-service" para edge-runtime self-hosted (EasyPanel).
//
// O edge-runtime é iniciado com:
//   edge-runtime start --main-service /home/deno/functions/main
//
// Nesse modo TODAS as requisições chegam aqui. Para evitar `import()` dinâmico
// e APIs internas como `EdgeRuntime.userWorkers`, importamos estaticamente as
// functions permitidas e capturamos os handlers que elas registram via
// `Deno.serve(handler)`.

import {
  ALLOWED_FUNCTIONS,
  corsHeaders,
  getCapturedHandler,
  jsonResponse,
  restoreOriginalDenoServe,
  serveMainRouter,
} from "./handler-capture.ts";

import "./register-supporter/index.ts";
import "./register-contratado/index.ts";
import "./register-funcionario/index.ts";
import "./link-supporter-account/index.ts";
import "./create-team-user/index.ts";
import "./calculate-ied/index.ts";
import "./check-alerts/index.ts";
import "./resolve-whatsapp-link/index.ts";

restoreOriginalDenoServe();

serveMainRouter(async (req: Request) => {
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

  // Healthcheck simples.
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
    const handler = getCapturedHandler(functionName);
    if (!handler) {
      throw new Error(`Handler da function "${functionName}" não foi capturado no boot.`);
    }

    // Reescreve o path para que a function alvo "veja" `/` como raiz,
    // mantendo querystring e qualquer segmento extra. Isso replica o
    // comportamento que a function teria se estivesse rodando isolada.
    const innerPath = "/" + segments.slice(1).join("/");
    const innerUrl = new URL(innerPath + url.search, url.origin);

    // Clona headers explicitamente para garantir que Authorization, apikey
    // e demais cabeçalhos enviados pelo cliente cheguem intactos no handler
    // alvo. Em alguns runtimes, passar `req.headers` direto pode perder
    // entradas multivaloradas ou ser tratado como imutável.
    const innerHeaders = new Headers();
    req.headers.forEach((value, key) => {
      innerHeaders.set(key, value);
    });

    // Garante que o header `apikey` exista quando só veio Authorization
    // (ou vice-versa). Várias libs do Supabase esperam ambos presentes.
    const authHeader = innerHeaders.get("authorization");
    const apiKeyHeader = innerHeaders.get("apikey");
    if (authHeader && !apiKeyHeader) {
      const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (bearer) innerHeaders.set("apikey", bearer);
    } else if (apiKeyHeader && !authHeader) {
      innerHeaders.set("authorization", `Bearer ${apiKeyHeader}`);
    }

    const innerReq = new Request(innerUrl.toString(), {
      method: req.method,
      headers: innerHeaders,
      body:
        req.method === "GET" || req.method === "HEAD"
          ? undefined
          : await req.arrayBuffer(),
    });

    const res = await handler(innerReq);

    // Garante CORS mesmo se a function alvo não tiver setado.
    const headers = new Headers(res.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
      if (!headers.has(key)) headers.set(key, value);
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
