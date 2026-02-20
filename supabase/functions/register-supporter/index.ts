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

// Normalize name for fuzzy comparison
function normalizeName(name: string): string {
  return name.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/\s+/g, " ");
}

// Check if two names are similar enough to match
function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  // Check if all words of the shorter name are contained in the longer
  const wordsA = na.split(" ").filter(w => w.length > 2);
  const wordsB = nb.split(" ").filter(w => w.length > 2);
  if (wordsA.length === 0 || wordsB.length === 0) return false;
  const shorter = wordsA.length <= wordsB.length ? wordsA : wordsB;
  const longer = wordsA.length <= wordsB.length ? wordsB : wordsA;
  const matchCount = shorter.filter(w => longer.some(lw => lw.includes(w) || w.includes(lw))).length;
  return matchCount >= Math.ceil(shorter.length * 0.7); // 70%+ words match
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

    // Check if any profile username already exists
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

    // Try to find an existing supporter by name (fuzzy match)
    // This links manually registered supporters to their real social profiles
    const { data: existingSupporters } = await supabase
      .from("supporters")
      .select("id, name")
      .eq("client_id", client_id);

    let supporterId: string | null = null;
    let isExisting = false;

    if (existingSupporters && existingSupporters.length > 0) {
      const matched = existingSupporters.find(s => namesMatch(s.name, name.trim()));
      if (matched) {
        supporterId = matched.id;
        isExisting = true;
        console.log(`Matched existing supporter: "${matched.name}" for name "${name.trim()}"`);
      }
    }

    if (!supporterId) {
      // Create new supporter
      const { data: supporter, error: supError } = await supabase
        .from("supporters")
        .insert({
          client_id,
          name: name.trim(),
          classification: "apoiador_ativo",
          notes: [notes?.trim(), phone?.trim() ? `Tel: ${phone.trim()}` : null].filter(Boolean).join(" | ") || null,
        })
        .select()
        .single();

      if (supError) throw supError;
      supporterId = supporter.id;
    } else {
      // Update existing supporter to active and add notes if any
      const updateData: Record<string, unknown> = { classification: "apoiador_ativo" };
      const extraNotes = [notes?.trim(), phone?.trim() ? `Tel: ${phone.trim()}` : null].filter(Boolean).join(" | ");
      if (extraNotes) updateData.notes = extraNotes;
      await supabase.from("supporters").update(updateData).eq("id", supporterId);
    }

    // Create profiles (link social accounts) - try to fetch avatar
    for (const p of profiles) {
      let avatarUrl: string | null = null;

      if (p.platform === "facebook") {
        // Facebook public graph avatar (works for usernames and numeric IDs)
        avatarUrl = `https://graph.facebook.com/${p.username}/picture?type=large&redirect=true`;
      }
      // Instagram does not allow public avatar fetching without API token — skip

      const { error: profileError } = await supabase.from("supporter_profiles").insert({
        supporter_id: supporterId,
        platform: p.platform,
        platform_user_id: p.username,
        platform_username: p.username,
        profile_picture_url: avatarUrl,
      });
      if (profileError) console.error("Profile insert error:", profileError);
    }

    // Link orphan actions with the new profile info
    await supabase.rpc("link_orphan_engagement_actions", { p_client_id: client_id });

    // Recalculate score for this supporter
    await supabase.rpc("calculate_engagement_score", { p_supporter_id: supporterId, p_days: 30 });

    const message = isExisting
      ? `Obrigado, ${name.trim()}! Seu perfil foi vinculado com sucesso. Suas interações anteriores foram contabilizadas!`
      : `Obrigado, ${name.trim()}! Você foi cadastrado(a) com sucesso como apoiador(a) de ${client.name}.`;

    return new Response(JSON.stringify({
      success: true,
      message,
      is_existing: isExisting,
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
