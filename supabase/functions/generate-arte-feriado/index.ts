// generate-arte-feriado
// Função ISOLADA usada apenas pelo Calendário Político para gerar arte de divulgação
// (feriados / temas do mês) usando Lovable AI (Nano Banana / Gemini Flash Image).
//
// Não substitui nem interfere no provedor de IA principal do sistema (configurado em
// "Configurações → Provedor de IA"), que segue cuidando de moderação, sentimento,
// respostas IA, etc.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = {
  prompt?: string;
  // "fast" = Nano Banana padrão (mais barato). "pro" = Nano Banana 2 (qualidade alta, ainda rápido).
  qualidade?: "fast" | "pro";
  // URL pública da logo do candidato (PNG transparente). Aplicada em toda arte.
  logoUrl?: string;
  // URL pública da foto escolhida do candidato. A IA NÃO recria o rosto —
  // usa a foto como referência e constrói a arte ao redor.
  photoUrl?: string;
};

const MODEL_FAST = "google/gemini-2.5-flash-image";
const MODEL_PRO = "google/gemini-3.1-flash-image-preview";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const prompt = (body.prompt ?? "").trim();
    if (!prompt || prompt.length < 10) {
      return new Response(
        JSON.stringify({ error: "Prompt vazio ou muito curto" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (prompt.length > 6000) {
      return new Response(
        JSON.stringify({ error: "Prompt muito longo (máx. 6000 caracteres)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const model = body.qualidade === "pro" ? MODEL_PRO : MODEL_FAST;

    // Validação simples das URLs (precisam ser http/https)
    const isValidUrl = (u?: string) =>
      !!u && /^https?:\/\//i.test(u) && u.length < 2000;

    const logoUrl = isValidUrl(body.logoUrl) ? body.logoUrl! : undefined;
    const photoUrl = isValidUrl(body.photoUrl) ? body.photoUrl! : undefined;

    // Monta as instruções extras quando há referências visuais.
    const refInstructions: string[] = [];
    if (photoUrl) {
      refInstructions.push(
        "IMPORTANTE: A primeira imagem em anexo é a FOTO DO CANDIDATO. " +
          "Use exatamente esse rosto e essa pessoa na composição — NÃO recrie, NÃO altere traços, " +
          "NÃO mude expressão. Apenas integre a pessoa na arte (fundo, elementos gráficos, iluminação coerente).",
      );
    }
    if (logoUrl) {
      refInstructions.push(
        (photoUrl ? "A segunda imagem" : "A imagem em anexo") +
          " é a LOGO da campanha. Aplique-a de forma elegante na arte (canto inferior, " +
          "tamanho moderado, sem distorcer cores ou proporções).",
      );
    }

    const finalText = refInstructions.length
      ? `${refInstructions.join("\n")}\n\n${prompt}`
      : prompt;

    // Constrói o conteúdo da mensagem (texto + imagens de referência quando houver)
    type ContentPart =
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } };

    const content: ContentPart[] = [{ type: "text", text: finalText }];
    if (photoUrl) content.push({ type: "image_url", image_url: { url: photoUrl } });
    if (logoUrl) content.push({ type: "image_url", image_url: { url: logoUrl } });

    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content }],
          modalities: ["image", "text"],
        }),
      },
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("[generate-arte-feriado] gateway error", aiResponse.status, errText);

      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({
            error:
              "Limite de requisições atingido. Aguarde alguns segundos e tente novamente.",
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({
            error:
              "Saldo de IA esgotado. Adicione créditos em Settings → Workspace → Cloud & AI balance.",
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ error: "Falha no gateway de IA", detail: errText.slice(0, 500) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await aiResponse.json();
    const imageUrl: string | undefined =
      data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageUrl) {
      console.error("[generate-arte-feriado] resposta sem imagem", JSON.stringify(data).slice(0, 800));
      return new Response(
        JSON.stringify({
          error:
            "A IA não retornou nenhuma imagem. Tente novamente ou ajuste o prompt.",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        imageUrl,
        model,
        provider: "lovable-ai",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[generate-arte-feriado] fatal", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});