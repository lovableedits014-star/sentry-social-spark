import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, CheckCircle2, Link2, RefreshCw, Users, Wand2 } from "lucide-react";
import { toast } from "sonner";

type Diag = {
  totalSupporters: number;
  withProfile: number;
  withValidId: number;
  withInvalidId: number;
  withRecentActions: number;
  fbProfiles: number;
  igProfiles: number;
  orphanActions: number;
};

const RECENT_DAYS = 30;

function isValidPlatformUserId(platform: string | null, id: string | null): boolean {
  if (!id) return false;
  const v = id.trim();
  if (!v) return false;
  if (v.startsWith("share_") || v.startsWith("placeholder_")) return false;
  if (platform === "facebook" || platform === "instagram") {
    // IDs reais de Facebook/Instagram são numéricos
    return /^\d{5,}$/.test(v);
  }
  return true;
}

export default function EngagementDiagnostics({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [linking, setLinking] = useState(false);
  const [data, setData] = useState<Diag | null>(null);

  const fetchDiag = async () => {
    setLoading(true);
    try {
      const sinceIso = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();

      // 1) Supporters do cliente
      const { data: supporters, error: e1 } = await supabase
        .from("supporters")
        .select("id")
        .eq("client_id", clientId);
      if (e1) throw e1;
      const supporterIds = (supporters || []).map((s) => s.id);
      const totalSupporters = supporterIds.length;

      let withProfile = 0;
      let withValidId = 0;
      let withInvalidId = 0;
      let fbProfiles = 0;
      let igProfiles = 0;
      let withRecentActions = 0;
      let orphanActions = 0;

      if (supporterIds.length > 0) {
        // 2) Perfis sociais — paginado para evitar limite de 1000
        const profilesAll: { supporter_id: string; platform: string; platform_user_id: string | null }[] = [];
        const pageSize = 1000;
        let from = 0;
        while (true) {
          const { data: page, error } = await supabase
            .from("supporter_profiles")
            .select("supporter_id, platform, platform_user_id")
            .in("supporter_id", supporterIds)
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!page || page.length === 0) break;
          profilesAll.push(...(page as any));
          if (page.length < pageSize) break;
          from += pageSize;
        }

        const supportersWithProfile = new Set<string>();
        const supportersWithValid = new Set<string>();
        const supportersWithInvalid = new Set<string>();
        for (const p of profilesAll) {
          supportersWithProfile.add(p.supporter_id);
          if (p.platform === "facebook") fbProfiles++;
          if (p.platform === "instagram") igProfiles++;
          if (isValidPlatformUserId(p.platform, p.platform_user_id)) {
            supportersWithValid.add(p.supporter_id);
          } else {
            supportersWithInvalid.add(p.supporter_id);
          }
        }
        withProfile = supportersWithProfile.size;
        withValidId = supportersWithValid.size;
        withInvalidId = supportersWithInvalid.size;

        // 3) Ações recentes (últimos 30 dias) — supporters distintos
        const recentActive = new Set<string>();
        from = 0;
        while (true) {
          const { data: page, error } = await supabase
            .from("engagement_actions")
            .select("supporter_id")
            .eq("client_id", clientId)
            .gte("action_date", sinceIso)
            .not("supporter_id", "is", null)
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!page || page.length === 0) break;
          for (const r of page as any[]) if (r.supporter_id) recentActive.add(r.supporter_id);
          if (page.length < pageSize) break;
          from += pageSize;
        }
        // intersecta com supporters do cliente
        for (const sid of recentActive) if (supporterIds.includes(sid)) withRecentActions++;
      }

      // 4) Ações órfãs (sem supporter_id) do cliente
      const { count: orphanCount } = await supabase
        .from("engagement_actions")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId)
        .is("supporter_id", null);
      orphanActions = orphanCount || 0;

      setData({
        totalSupporters,
        withProfile,
        withValidId,
        withInvalidId,
        withRecentActions,
        fbProfiles,
        igProfiles,
        orphanActions,
      });
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar diagnóstico");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDiag(); }, [clientId]);

  const handleResolveProfiles = async () => {
    setResolving(true);
    const tid = toast.loading("Resolvendo IDs de perfis...");
    try {
      const { data: r, error } = await supabase.functions.invoke("resolve-supporter-profiles", {
        body: { client_id: clientId, limit: 200 },
      });
      if (error) throw error;
      const res = r as any;
      const ok = (res?.resolved_via_comments || 0) + (res?.resolved_via_graph || 0) + (res?.resolved_via_share || 0);
      toast.success(`${ok} de ${res?.total ?? 0} perfis corrigidos. ${res?.failed ?? 0} falharam.`, { id: tid });
      await fetchDiag();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao resolver perfis", { id: tid });
    } finally {
      setResolving(false);
    }
  };

  const handleRelinkOrphans = async () => {
    setLinking(true);
    const tid = toast.loading("Reprocessando vínculos de ações órfãs...");
    try {
      const { data: r, error } = await supabase.rpc("link_orphan_engagement_actions" as any, {
        p_client_id: clientId,
      });
      if (error) throw error;
      const linked = (r as any) ?? 0;
      toast.success(`${linked} ações vinculadas a apoiadores.`, { id: tid });
      await fetchDiag();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao reprocessar vínculos", { id: tid });
    } finally {
      setLinking(false);
    }
  };

  const stats = data;
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Diagnóstico da saúde do rastreamento de engajamento
          </p>
          <p className="text-xs text-muted-foreground/80 mt-0.5">
            Mostra quantos apoiadores têm perfil social vinculado, quantos têm ID válido (numérico do Facebook/Instagram) e quantos interagiram nos últimos {RECENT_DAYS} dias.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={fetchDiag} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={handleResolveProfiles} disabled={resolving}
            title="Converte usernames e links de share em IDs numéricos do Facebook">
            <Wand2 className={`w-4 h-4 mr-2 ${resolving ? "animate-pulse" : ""}`} />
            Resolver IDs
          </Button>
          <Button variant="default" size="sm" onClick={handleRelinkOrphans} disabled={linking}
            title="Reprocessa ações sem apoiador vinculado tentando casar por ID, username ou nome">
            <Link2 className={`w-4 h-4 mr-2 ${linking ? "animate-pulse" : ""}`} />
            Reprocessar vínculos
          </Button>
        </div>
      </div>

      {loading && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5 space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-32" />
            </CardContent></Card>
          ))}
        </div>
      )}

      {!loading && stats && (
        <>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Apoiadores</span>
                  <Users className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-3xl font-bold">{stats.totalSupporters}</p>
                <p className="text-xs text-muted-foreground">Total cadastrado no cliente</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Com perfil vinculado</span>
                  <Link2 className="w-4 h-4 text-primary" />
                </div>
                <p className="text-3xl font-bold">{stats.withProfile}</p>
                <p className="text-xs text-muted-foreground">
                  {pct(stats.withProfile, stats.totalSupporters)}% · FB {stats.fbProfiles} · IG {stats.igProfiles}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Com ID válido</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.withValidId}</p>
                <p className="text-xs text-muted-foreground">
                  {pct(stats.withValidId, stats.withProfile)}% dos vinculados · ID numérico real
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Ativos ({RECENT_DAYS}d)</span>
                  <Activity className="w-4 h-4 text-primary" />
                </div>
                <p className="text-3xl font-bold text-primary">{stats.withRecentActions}</p>
                <p className="text-xs text-muted-foreground">
                  {pct(stats.withRecentActions, stats.totalSupporters)}% interagiram recentemente
                </p>
              </CardContent>
            </Card>
          </div>

          {(stats.withInvalidId > 0 || stats.orphanActions > 0) && (
            <Card className="border-amber-500/40 bg-amber-500/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Pontos de atenção
                </CardTitle>
                <CardDescription className="text-xs">
                  Use os botões acima para corrigir automaticamente
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {stats.withInvalidId > 0 && (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex-1">
                      <p className="font-medium">Perfis com ID inválido</p>
                      <p className="text-xs text-muted-foreground">
                        Usernames ou links de share que não geram pontuação. Use <span className="font-medium">Resolver IDs</span>.
                      </p>
                    </div>
                    <Badge variant="destructive">{stats.withInvalidId}</Badge>
                  </div>
                )}
                {stats.orphanActions > 0 && (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex-1">
                      <p className="font-medium">Ações sem apoiador vinculado</p>
                      <p className="text-xs text-muted-foreground">
                        Curtidas/comentários capturados mas não atribuídos. Use <span className="font-medium">Reprocessar vínculos</span>.
                      </p>
                    </div>
                    <Badge variant="destructive">{stats.orphanActions}</Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {stats.withInvalidId === 0 && stats.orphanActions === 0 && stats.totalSupporters > 0 && (
            <Card className="border-emerald-500/40 bg-emerald-500/5">
              <CardContent className="p-4 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <p className="text-sm">Tudo certo! Todos os perfis têm ID válido e nenhuma ação está órfã.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}