// Roteador "main-service" para edge-runtime self-hosted (EasyPanel).
//
// O edge-runtime é iniciado com:
//   edge-runtime start --main-service /home/deno/functions/main
//
// Nesse modo TODAS as requisições chegam aqui. Em vez de usar
// `EdgeRuntime.userWorkers` (que falha com "Cannot read properties of
// undefined (reading 'streamRid')" em algumas versões do edge-runtime),
// importamos cada function dinamicamente UMA ÚNICA VEZ e capturamos o
// handler que ela registra via `Deno.serve(handler)`.
//
// Vantagens:
//   - Nenhuma function precisa ser modificada (continuam usando
//     `Deno.serve` ou `serve` do std/http normalmente).
//   - Sem dependência de APIs internas (`userWorkers`).
//   - Cold start só na primeira chamada de cada function; depois fica
//     em cache no mesmo isolate.
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

// ---------------------------------------------------------------------------
// Captura de handlers via monkey-patch de `Deno.serve` e do `serve` do std.
// ---------------------------------------------------------------------------

type Handler = (req: Request) => Response | Promise<Response>;

const handlerCache = new Map<string, Handler>();
const loadingLocks = new Map<string, Promise<Handler>>();

// Guarda o `Deno.serve` original — o main-service já está usando ele para
// receber as requisições reais (este arquivo). Vamos substituí-lo
// temporariamente apenas durante o `import()` de cada function-alvo.
const originalDenoServe = Deno.serve.bind(Deno);

async function loadHandler(functionName: string): Promise<Handler> {
  const cached = handlerCache.get(functionName);
  if (cached) return cached;

  const inFlight = loadingLocks.get(functionName);
  if (inFlight) return inFlight;

  const promise = (async () => {
    let captured: Handler | null = null;

    // Substitui Deno.serve apenas para capturar o handler registrado pela
    // function. Aceita as várias assinaturas suportadas:
    //   Deno.serve(handler)
    //   Deno.serve(options, handler)
    //   Deno.serve({ handler, ... })
    // Retornamos um stub minimamente compatível com Deno.HttpServer para
    // não quebrar code-paths que aguardem `.finished`.
    // deno-lint-ignore no-explicit-any
    (Deno as any).serve = (...args: unknown[]): unknown => {
      for (const arg of args) {
        if (typeof arg === "function") {
          captured = arg as Handler;
          break;
        }
        if (arg && typeof arg === "object" && "handler" in (arg as Record<string, unknown>)) {
          const h = (arg as { handler?: unknown }).handler;
          if (typeof h === "function") {
            captured = h as Handler;
            break;
          }
        }
      }
      return {
        finished: Promise.resolve(),
        shutdown: () => Promise.resolve(),
        ref: () => {},
        unref: () => {},
        addr: { transport: "tcp", hostname: "0.0.0.0", port: 0 },
      };
    };

    try {
      // Import dinâmico do módulo da function.
      //
      // No edge-runtime self-hosted, o `main-service` é compilado para
      // /var/tmp/sb-compile-edge-runtime/main/index.ts, então caminhos
      // relativos (`../<name>/index.ts`) tentam resolver para um diretório
      // que NÃO existe (apenas o `main` é compilado para lá).
      //
      // O código-fonte real continua montado em /home/deno/functions/<name>/index.ts
      // (volume do container). Resolvemos a URL absoluta a partir de
      // `import.meta.url` para apontar para o irmão correto. Como o `main`
      // pode estar tanto em /home/deno/functions/main/ quanto em
      // /var/tmp/.../main/, tentamos primeiro o vizinho via `import.meta.url`
      // e, se falhar, caímos para o caminho absoluto canônico do volume.
      const candidates = [
        new URL(`../${functionName}/index.ts`, import.meta.url).href,
        `file:///home/deno/functions/${functionName}/index.ts`,
      ];

      let lastErr: unknown = null;
      let imported = false;
      for (const url of candidates) {
        try {
          await import(url);
          imported = true;
          break;
        } catch (err) {
          lastErr = err;
        }
      }
      if (!imported) {
        throw lastErr ?? new Error(`Não foi possível importar "${functionName}".`);
      }
    } finally {
      // Restaura o Deno.serve original imediatamente para não interferir
      // em qualquer outro código que rode no isolate.
      // deno-lint-ignore no-explicit-any
      (Deno as any).serve = originalDenoServe;
    }

    if (!captured) {
      throw new Error(
        `Function "${functionName}" não registrou nenhum handler via Deno.serve.`,
      );
    }

    handlerCache.set(functionName, captured);
    return captured;
  })();

  loadingLocks.set(functionName, promise);
  try {
    return await promise;
  } finally {
    loadingLocks.delete(functionName);
  }
}

originalDenoServe(async (req: Request) => {
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
    const handler = await loadHandler(functionName);

    // Reescreve o path para que a function alvo "veja" `/` como raiz,
    // mantendo querystring e qualquer segmento extra. Isso replica o
    // comportamento que a function teria se estivesse rodando isolada.
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

    const res = await handler(innerReq);

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