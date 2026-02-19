import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function parseProfileUrl(url: string): { platform: "facebook" | "instagram"; username: string } | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const fbPatterns = [
    /(?:https?:\/\/)?(?:www\.)?(?:m\.)?facebook\.com\/(?:profile\.php\?id=(\d+))/i,
    /(?:https?:\/\/)?(?:www\.)?(?:m\.)?facebook\.com\/([a-zA-Z0-9._-]+)\/?/i,
    /(?:https?:\/\/)?(?:www\.)?(?:m\.)?fb\.com\/([a-zA-Z0-9._-]+)\/?/i,
  ];
  for (const pattern of fbPatterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      const u = match[1];
      if (["groups","pages","events","watch","marketplace","gaming","reel","stories","photo","permalink"].includes(u.toLowerCase())) continue;
      return { platform: "facebook", username: u };
    }
  }

  const igPatterns = [
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)\/?/i,
    /(?:https?:\/\/)?(?:www\.)?instagr\.am\/([a-zA-Z0-9._]+)\/?/i,
  ];
  for (const pattern of igPatterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      const u = match[1];
      if (["p","reel","stories","explore","direct","accounts","about"].includes(u.toLowerCase())) continue;
      return { platform: "instagram", username: u };
    }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { client_id, name, facebook_url, instagram_url, phone, notes } = await req.json();

    if (!client_id || !name?.trim()) {
      return new Response(JSON.stringify({ success: false, error: "Nome e client_id são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const profiles: { platform: "facebook" | "instagram"; username: string }[] = [];
    if (facebook_url) {
      const parsed = parseProfileUrl(facebook_url);
      if (parsed) profiles.push(parsed);
    }
    if (instagram_url) {
      const parsed = parseProfileUrl(instagram_url);
      if (parsed) profiles.push(parsed);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify client exists
    const { data: client } = await supabase
      .from("clients")
      .select("id, name")
      .eq("id", client_id)
      .single();

    if (!client) {
      return new Response(JSON.stringify({ success: false, error: "Cliente não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if any profile already exists
    if (profiles.length > 0) {
      const { data: existing } = await supabase
        .from("supporter_profiles")
        .select("supporter_id, platform_user_id")
        .in("platform_user_id", profiles.map(p => p.username));

      if (existing && existing.length > 0) {
        return new Response(JSON.stringify({
          success: false,
          error: "Um ou mais perfis já estão cadastrados. Você já é um apoiador!",
        }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Create supporter
    const { data: supporter, error: supError } = await supabase
      .from("supporters")
      .insert({
        client_id,
        name: name.trim(),
        classification: "apoiador_passivo",
        notes: [notes?.trim(), phone?.trim() ? `Tel: ${phone.trim()}` : null].filter(Boolean).join(" | ") || null,
      })
      .select()
      .single();

    if (supError) throw supError;

    // Create profiles
    for (const p of profiles) {
      await supabase.from("supporter_profiles").insert({
        supporter_id: supporter.id,
        platform: p.platform,
        platform_user_id: p.username,
        platform_username: p.username,
      });
    }

    // Link orphan actions
    await supabase.rpc("link_orphan_engagement_actions", { p_client_id: client_id });

    return new Response(JSON.stringify({
      success: true,
      message: `Obrigado, ${name.trim()}! Você foi cadastrado(a) com sucesso como apoiador(a) de ${client.name}.`,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
