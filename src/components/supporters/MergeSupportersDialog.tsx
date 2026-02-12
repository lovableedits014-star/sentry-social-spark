import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Merge, Instagram, Facebook } from "lucide-react";
import { toast } from "sonner";
import { Supporter, classificationLabels } from "./SupporterCard";

type Props = {
  supporters: Supporter[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMergeComplete: () => void;
};

export const MergeSupportersDialog = ({ supporters, open, onOpenChange, onMergeComplete }: Props) => {
  const [mergedName, setMergedName] = useState(supporters[0]?.name || "");
  const [mergedClassification, setMergedClassification] = useState(supporters[0]?.classification || "neutro");
  const [loading, setLoading] = useState(false);

  if (supporters.length !== 2) return null;

  const [primary, secondary] = supporters;

  const allProfiles = [
    ...(primary.supporter_profiles || []),
    ...(secondary.supporter_profiles || []),
  ];

  const handleMerge = async () => {
    setLoading(true);
    try {
      // 1. Move all profiles from secondary to primary
      for (const profile of secondary.supporter_profiles || []) {
        // Check if this exact profile already exists on primary
        const { data: existing } = await supabase
          .from("supporter_profiles")
          .select("id")
          .eq("supporter_id", primary.id)
          .eq("platform", profile.platform)
          .eq("platform_user_id", profile.platform_user_id)
          .limit(1);

        if (!existing || existing.length === 0) {
          await supabase
            .from("supporter_profiles")
            .update({ supporter_id: primary.id })
            .eq("id", profile.id);
        }
      }

      // 2. Move engagement_actions from secondary to primary
      await supabase
        .from("engagement_actions")
        .update({ supporter_id: primary.id } as any)
        .eq("supporter_id", secondary.id);

      // 3. Move team assignments from secondary to primary
      await supabase
        .from("team_supporter_assignments")
        .update({ supporter_id: primary.id } as any)
        .eq("supporter_id", secondary.id);

      // 4. Update primary supporter with merged info
      const mergedScore = (primary.engagement_score || 0) + (secondary.engagement_score || 0);
      const earliestContact = new Date(primary.first_contact_date) < new Date(secondary.first_contact_date)
        ? primary.first_contact_date
        : secondary.first_contact_date;
      const latestInteraction = new Date(primary.last_interaction_date) > new Date(secondary.last_interaction_date)
        ? primary.last_interaction_date
        : secondary.last_interaction_date;

      const mergedNotes = [primary.notes, secondary.notes].filter(Boolean).join(" | ");

      await supabase
        .from("supporters")
        .update({
          name: mergedName,
          classification: mergedClassification as any,
          engagement_score: mergedScore,
          first_contact_date: earliestContact,
          last_interaction_date: latestInteraction,
          notes: mergedNotes || null,
        } as any)
        .eq("id", primary.id);

      // 5. Delete secondary supporter
      await supabase
        .from("supporter_profiles")
        .delete()
        .eq("supporter_id", secondary.id);

      await supabase
        .from("supporters")
        .delete()
        .eq("id", secondary.id);

      toast.success("Apoiadores unificados com sucesso!");
      onOpenChange(false);
      onMergeComplete();
    } catch (error: any) {
      console.error("Error merging supporters:", error);
      toast.error("Erro ao unificar apoiadores");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="w-5 h-5" />
            Unificar Apoiadores
          </DialogTitle>
          <DialogDescription>
            Una dois perfis que pertencem à mesma pessoa em um único apoiador
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Visual merge preview */}
          <div className="flex items-center gap-3 justify-center">
            <div className="text-center space-y-2">
              <Avatar className="h-12 w-12 mx-auto">
                <AvatarImage src={primary.supporter_profiles?.[0]?.profile_picture_url || ''} />
                <AvatarFallback>{primary.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <p className="text-sm font-medium">{primary.name}</p>
              <div className="flex flex-wrap gap-1 justify-center">
                {primary.supporter_profiles?.map(p => (
                  <Badge key={p.id} variant="outline" className="text-xs gap-1">
                    {p.platform === "instagram" ? <Instagram className="w-3 h-3" /> : <Facebook className="w-3 h-3" />}
                    {p.platform_username || p.platform_user_id.substring(0, 8)}
                  </Badge>
                ))}
              </div>
            </div>

            <ArrowRight className="w-6 h-6 text-muted-foreground flex-shrink-0" />

            <div className="text-center space-y-2">
              <Avatar className="h-12 w-12 mx-auto">
                <AvatarImage src={secondary.supporter_profiles?.[0]?.profile_picture_url || ''} />
                <AvatarFallback>{secondary.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <p className="text-sm font-medium">{secondary.name}</p>
              <div className="flex flex-wrap gap-1 justify-center">
                {secondary.supporter_profiles?.map(p => (
                  <Badge key={p.id} variant="outline" className="text-xs gap-1">
                    {p.platform === "instagram" ? <Instagram className="w-3 h-3" /> : <Facebook className="w-3 h-3" />}
                    {p.platform_username || p.platform_user_id.substring(0, 8)}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Result preview */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium text-primary">Resultado da unificação:</p>
            <div className="flex flex-wrap gap-1">
              {allProfiles.map((p, i) => (
                <Badge key={i} variant="outline" className="gap-1">
                  {p.platform === "instagram" ? <Instagram className="w-3 h-3" /> : <Facebook className="w-3 h-3" />}
                  {p.platform_username || p.platform_user_id.substring(0, 8)}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Score combinado: {(primary.engagement_score || 0) + (secondary.engagement_score || 0)}
            </p>
          </div>

          {/* Merged supporter config */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Nome do apoiador unificado</Label>
              <Input value={mergedName} onChange={(e) => setMergedName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Classificação</Label>
              <Select value={mergedClassification} onValueChange={setMergedClassification}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="apoiador_ativo">Apoiador Ativo</SelectItem>
                  <SelectItem value="apoiador_passivo">Apoiador Passivo</SelectItem>
                  <SelectItem value="neutro">Neutro</SelectItem>
                  <SelectItem value="critico">Crítico/Oposição</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={handleMerge} disabled={loading} className="w-full">
            <Merge className="w-4 h-4 mr-2" />
            {loading ? "Unificando..." : "Confirmar Unificação"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
