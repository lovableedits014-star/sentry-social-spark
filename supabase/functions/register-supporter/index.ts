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

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  const wordsA = na.split(" ").filter(w => w.length > 2);
  const wordsB = nb.split(" ").filter(w => w.length > 2);
  if (wordsA.length === 0 || wordsB.length === 0) return false;
  const shorter = wordsA.length <= wordsB.length ? wordsA : wordsB;
  const longer = wordsA.length <= wordsB.length ? wordsB : wordsA;
  const matchCount = shorter.filter(w => longer.some(lw => lw.includes(w) || w.includes(lw))).length;
  return matchCount >= Math.ceil(shorter.length * 0.7);
}

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { client_id, name, facebook_url, instagram_url, phone, notes, referral_code, city, neighborhood, state } = await req.json();

    if (!client_id || !name?.trim()) {
      return new Response(JSON.stringify({ success: false, error: "Nome e client_id são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!city?.trim() || !neighborhood?.trim()) {
      return new Response(JSON.stringify({ success: false, error: "Cidade e bairro são obrigatórios" }), {
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

    // Resolve referral code if provided
    let referrerAccountId: string | null = null;
    let referrerName: string | null = null;
    if (referral_code) {
      const { data: refCode } = await supabase
        .from("referral_codes")
        .select("supporter_account_id, supporter_accounts!inner(name)")
        .eq("code", referral_code.toUpperCase())
        .eq("client_id", client_id)
        .maybeSingle();

      if (refCode) {
        referrerAccountId = refCode.supporter_account_id;
        referrerName = (refCode as any).supporter_accounts?.name || null;
      }
    }

    // Try to find an existing supporter by name (fuzzy match)
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
      const updateData: Record<string, unknown> = { classification: "apoiador_ativo" };
      const extraNotes = [notes?.trim(), phone?.trim() ? `Tel: ${phone.trim()}` : null].filter(Boolean).join(" | ");
      if (extraNotes) updateData.notes = extraNotes;
      await supabase.from("supporters").update(updateData).eq("id", supporterId);
    }

    // Create profiles (link social accounts)
    for (const p of profiles) {
      let avatarUrl: string | null = null;
      if (p.platform === "facebook") {
        avatarUrl = `https://graph.facebook.com/${p.username}/picture?type=large&redirect=true`;
      }
      const { error: profileError } = await supabase.from("supporter_profiles").insert({
        supporter_id: supporterId,
        platform: p.platform,
        platform_user_id: p.username,
        platform_username: p.username,
        profile_picture_url: avatarUrl,
      });
      if (profileError) console.error("Profile insert error:", profileError);
    }

    // Link orphan actions
    await supabase.rpc("link_orphan_engagement_actions", { p_client_id: client_id });
    await supabase.rpc("calculate_engagement_score", { p_supporter_id: supporterId, p_days: 30 });

    // Create or update pessoa record in CRM (so apoiador appears in Base Política)
    try {
      const { data: existingPessoa } = await supabase
        .from("pessoas")
        .select("id")
        .eq("client_id", client_id)
        .eq("supporter_id", supporterId)
        .maybeSingle();

      if (!existingPessoa) {
        const pessoaPayload: Record<string, unknown> = {
          client_id,
          nome: name.trim(),
          telefone: phone?.trim() || null,
          cidade: city?.trim() || null,
          bairro: neighborhood?.trim() || null,
          tipo_pessoa: "apoiador",
          nivel_apoio: "apoiador",
          origem_contato: "formulario",
          supporter_id: supporterId,
          notas_internas: notes?.trim() || null,
        };
        const { data: pessoaInserted, error: pessoaError } = await supabase
          .from("pessoas")
          .insert(pessoaPayload)
          .select("id")
          .single();

        if (pessoaError) {
          console.error("Pessoa insert error:", pessoaError);
        } else if (pessoaInserted && profiles.length > 0) {
          for (const p of profiles) {
            await supabase.from("pessoa_social").insert({
              pessoa_id: pessoaInserted.id,
              plataforma: p.platform,
              usuario: p.username,
              url_perfil: p.platform === "facebook"
                ? `https://facebook.com/${p.username}`
                : `https://instagram.com/${p.username}`,
            });
          }
        }
      }
    } catch (pessoaErr) {
      console.error("Erro ao criar pessoa no CRM:", pessoaErr);
    }


    // Return supporter_id and referrer info for the frontend to handle referral linking
    // after auth account is created
    const message = isExisting
      ? `Obrigado, ${name.trim()}! Seu perfil foi vinculado com sucesso. Suas interações anteriores foram contabilizadas!`
      : `Obrigado, ${name.trim()}! Você foi cadastrado(a) com sucesso como apoiador(a) de ${client.name}.`;

    return new Response(JSON.stringify({
      success: true,
      message,
      is_existing: isExisting,
      supporter_id: supporterId,
      referrer_account_id: referrerAccountId,
      referrer_name: referrerName,
      // Pass location data back so frontend can save after auth
      location_data: { city: city?.trim() || null, neighborhood: neighborhood?.trim() || null, state: state?.trim() || null },
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
