// Captura handlers das Edge Functions importadas estaticamente pelo main-service.

export type Handler = (req: Request) => Response | Promise<Response>;

export const FUNCTION_IMPORT_ORDER = [
  "register-supporter",
  "register-contratado",
  "register-funcionario",
  "link-supporter-account",
  "create-team-user",
  "calculate-ied",
  "check-alerts",
  "resolve-whatsapp-link",
] as const;

export const ALLOWED_FUNCTIONS = new Set<string>(FUNCTION_IMPORT_ORDER);

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const handlerCache = new Map<string, Handler>();
let captureIndex = 0;

const originalDenoServe = Deno.serve.bind(Deno);

function extractHandler(args: unknown[]): Handler | null {
  for (const arg of args) {
    if (typeof arg === "function") {
      return arg as Handler;
    }

    if (arg && typeof arg === "object" && "handler" in (arg as Record<string, unknown>)) {
      const handler = (arg as { handler?: unknown }).handler;
      if (typeof handler === "function") {
        return handler as Handler;
      }
    }
  }

  return null;
}

function createServerStub(): unknown {
  return {
    finished: Promise.resolve(),
    shutdown: () => Promise.resolve(),
    ref: () => {},
    unref: () => {},
    addr: { transport: "tcp", hostname: "0.0.0.0", port: 0 },
  };
}

// Este módulo precisa ser importado ANTES das 8 functions.
// Como imports estáticos são avaliados em ordem de dependência, o patch abaixo
// fica ativo enquanto cada ../<function>/index.ts executa seu Deno.serve(...).
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (...args: unknown[]): unknown => {
  const handler = extractHandler(args);
  if (!handler) {
    throw new Error("Deno.serve foi chamado sem um handler capturável.");
  }

  const functionName = FUNCTION_IMPORT_ORDER[captureIndex];
  if (!functionName) {
    throw new Error("Uma function extra chamou Deno.serve fora da allowlist do main-service.");
  }

  handlerCache.set(functionName, handler);
  captureIndex += 1;

  return createServerStub();
};

export function getCapturedHandler(functionName: string): Handler | undefined {
  return handlerCache.get(functionName);
}

export function restoreOriginalDenoServe(): void {
  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = originalDenoServe;
}

export function serveMainRouter(handler: Handler): unknown {
  return originalDenoServe(handler);
}
