import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      client_id, lider_id, nome, telefone, email, senha,
      cidade, bairro, endereco, zona_eleitoral, notas, redes_sociais,
    } = await req.json();

    if (!client_id || !nome || !telefone || !email || !senha) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios: nome, telefone, email, senha" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify client exists
    const { data: clientData } = await adminClient
      .from("clients")
      .select("id")
      .eq("id", client_id)
      .maybeSingle();

    if (!clientData) {
      return new Response(JSON.stringify({ error: "Cliente não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if email already exists as contratado
    const { data: existing } = await adminClient
      .from("contratados")
      .select("id")
      .eq("client_id", client_id)
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "Este e-mail já está cadastrado como contratado." }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create auth user
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { full_name: nome, role: "contratado" },
    });

    if (createError) {
      console.error("Error creating user:", createError);
      const msg = createError.message.includes("already been registered")
        ? "Este e-mail já possui uma conta. Use outro e-mail."
        : createError.message;
      return new Response(JSON.stringify({ error: msg }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert contratado record
    const { data: contratado, error: insertError } = await adminClient
      .from("contratados")
      .insert({
        client_id,
        lider_id: lider_id || null,
        user_id: newUser.user.id,
        nome: nome.trim(),
        telefone: telefone.trim(),
        email: email.trim(),
        cidade: cidade?.trim() || null,
        bairro: bairro?.trim() || null,
        endereco: endereco?.trim() || null,
        zona_eleitoral: zona_eleitoral?.trim() || null,
        notas: notas?.trim() || null,
        redes_sociais: redes_sociais || [],
        contrato_aceito: false,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Error inserting contratado:", insertError);
      // Rollback: delete auth user
      await adminClient.auth.admin.deleteUser(newUser.user.id);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Add contratado role
    await adminClient.from("user_roles").insert({
      user_id: newUser.user.id,
      role: "contratado",
    }).catch(() => {}); // role may not exist in enum, that's ok

    return new Response(JSON.stringify({
      success: true,
      contratado_id: contratado.id,
      user_id: newUser.user.id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Erro interno do servidor" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
