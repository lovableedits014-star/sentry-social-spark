import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) throw new Error("Unauthorized");

    const { clientId } = await req.json();
    if (!clientId) throw new Error("clientId required");

    // Verify ownership
    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .eq("user_id", user.id)
      .single();
    if (!client) throw new Error("Client not found");

    const now = new Date();
    // Current week start (Monday)
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString().split("T")[0];

    // 30 days ago
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    // 60 days ago (for growth comparison)
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(now.getDate() - 60);

    // ── 1. SENTIMENT SCORE (0-100) ──
    // Ratio of positive comments vs total analyzed
    const { data: comments } = await supabase
      .from("comments")
      .select("sentiment")
      .eq("client_id", clientId)
      .not("text", "eq", "__post_stub__")
      .eq("is_page_owner", false)
      .not("sentiment", "is", null)
      .gte("comment_created_time", thirtyDaysAgo.toISOString());

    const totalAnalyzed = comments?.length || 0;
    const positiveCount = comments?.filter(c => c.sentiment === "positive").length || 0;
    const negativeCount = comments?.filter(c => c.sentiment === "negative").length || 0;
    const neutralCount = comments?.filter(c => c.sentiment === "neutral").length || 0;

    // Weighted: positive=100, neutral=50, negative=0
    let sentimentScore = 0;
    if (totalAnalyzed > 0) {
      sentimentScore = Math.round(
        ((positiveCount * 100) + (neutralCount * 50) + (negativeCount * 0)) / totalAnalyzed
      );
    }

    // ── 2. GROWTH SCORE (0-100) ──
    // Compare supporters created in last 30 days vs previous 30 days
    const { count: recentSupporters } = await supabase
      .from("supporters")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .gte("created_at", thirtyDaysAgo.toISOString());

    const { count: previousSupporters } = await supabase
      .from("supporters")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .gte("created_at", sixtyDaysAgo.toISOString())
      .lt("created_at", thirtyDaysAgo.toISOString());

    const { count: totalSupporters } = await supabase
      .from("supporters")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId);

    let growthScore = 0;
    const recent = recentSupporters || 0;
    const previous = previousSupporters || 0;
    if (previous > 0) {
      const growthRate = ((recent - previous) / previous) * 100;
      // Map: -50% or worse = 0, 0% = 50, +100% or more = 100
      growthScore = Math.round(Math.max(0, Math.min(100, 50 + growthRate / 2)));
    } else if (recent > 0) {
      growthScore = 80; // New growth from zero
    } else {
      growthScore = (totalSupporters || 0) > 0 ? 30 : 0; // Stagnant but has base
    }

    // ── 3. ENGAGEMENT SCORE (0-100) ──
    // Average engagement score of active supporters
    const { data: supporters } = await supabase
      .from("supporters")
      .select("engagement_score")
      .eq("client_id", clientId)
      .not("engagement_score", "is", null)
      .gt("engagement_score", 0);

    let engagementScore = 0;
    if (supporters && supporters.length > 0) {
      const avgScore = supporters.reduce((sum, s) => sum + (s.engagement_score || 0), 0) / supporters.length;
      // Normalize: assume max realistic score ~50, map to 0-100
      engagementScore = Math.round(Math.min(100, (avgScore / 30) * 100));
    }

    // Also factor in: what % of supporters are active (have engagement > 0)
    const activeRatio = (totalSupporters || 0) > 0
      ? (supporters?.length || 0) / (totalSupporters || 1)
      : 0;
    engagementScore = Math.round(engagementScore * 0.6 + activeRatio * 100 * 0.4);

    // ── 4. CHECK-IN SCORE (0-100) ──
    // Check-in frequency in last 30 days
    const { count: checkinCount } = await supabase
      .from("supporter_checkins")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .gte("checkin_at", thirtyDaysAgo.toISOString());

    const { count: accountCount } = await supabase
      .from("supporter_accounts")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId);

    let checkinScore = 0;
    const accounts = accountCount || 0;
    const checkins = checkinCount || 0;
    if (accounts > 0) {
      // Ideal: each supporter checks in at least once a week (4x in 30 days)
      const idealCheckins = accounts * 4;
      checkinScore = Math.round(Math.min(100, (checkins / idealCheckins) * 100));
    }

    // ── FINAL IED SCORE ──
    // Weighted average
    const finalScore = Math.round(
      sentimentScore * 0.30 +
      growthScore * 0.25 +
      engagementScore * 0.25 +
      checkinScore * 0.20
    );

    const details = {
      sentiment: { total: totalAnalyzed, positive: positiveCount, negative: negativeCount, neutral: neutralCount },
      growth: { recent, previous, total: totalSupporters || 0 },
      engagement: { activeCount: supporters?.length || 0, totalSupporters: totalSupporters || 0 },
      checkins: { count: checkins, accounts },
    };

    // Upsert score for current week
    const { error: upsertError } = await supabase
      .from("ied_scores")
      .upsert({
        client_id: clientId,
        score: finalScore,
        sentiment_score: sentimentScore,
        growth_score: growthScore,
        engagement_score: engagementScore,
        checkin_score: checkinScore,
        week_start: weekStartStr,
        details,
      }, { onConflict: "client_id,week_start" });

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      throw new Error("Failed to save IED score");
    }

    // Fetch last 12 weeks of history
    const { data: history } = await supabase
      .from("ied_scores")
      .select("*")
      .eq("client_id", clientId)
      .order("week_start", { ascending: true })
      .limit(12);

    return new Response(JSON.stringify({
      success: true,
      current: {
        score: finalScore,
        sentiment_score: sentimentScore,
        growth_score: growthScore,
        engagement_score: engagementScore,
        checkin_score: checkinScore,
        details,
      },
      history: history || [],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("IED calc error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
