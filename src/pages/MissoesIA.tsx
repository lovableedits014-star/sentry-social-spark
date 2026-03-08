import AIMissionsPanel from "@/components/engagement/AIMissionsPanel";
import { PortalMissionsPanel } from "@/components/engagement/PortalMissionsPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Target } from "lucide-react";

export default function MissoesIA() {
  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Missões Inteligentes</h1>
          <p className="text-sm text-muted-foreground">
            Sugestões de missões geradas por IA baseadas nos temas em alta
          </p>
        </div>
      </div>

      <Tabs defaultValue="sugestoes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sugestoes" className="gap-1.5">
            <Sparkles className="w-4 h-4" />
            Sugestões da IA
          </TabsTrigger>
          <TabsTrigger value="missoes" className="gap-1.5">
            <Target className="w-4 h-4" />
            Missões Ativas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sugestoes">
          <AIMissionsPanel />
        </TabsContent>

        <TabsContent value="missoes">
          <PortalMissionsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
