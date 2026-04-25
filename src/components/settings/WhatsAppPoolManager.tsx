import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Smartphone, ShieldCheck, Activity } from "lucide-react";
import { toast } from "sonner";
import WhatsAppInstancePoolCard, { type PoolInstance } from "./WhatsAppInstancePoolCard";
import WhatsAppPoolSummary from "./WhatsAppPoolSummary";
import WhatsAppWindowSettings from "./WhatsAppWindowSettings";
import AddInstanceDialog from "./AddInstanceDialog";

interface Props {
  clientId: string;
}

export default function WhatsAppPoolManager({ clientId }: Props) {
  const [instances, setInstances] = useState<PoolInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const fetchInstances = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("manage-whatsapp-instance", {
      body: { action: "list_instances", client_id: clientId },
    });
    if (error || data?.error) {
      toast.error("Erro ao carregar instâncias: " + (error?.message || data?.error));
      setInstances([]);
    } else {
      setInstances((data?.instances || []) as PoolInstance[]);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    fetchInstances();
    const id = setInterval(fetchInstances, 30000);
    return () => clearInterval(id);
  }, [fetchInstances]);

  const activeCount = instances.filter((i) => i.is_active && i.status === "connected").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              Pool de Instâncias WhatsApp
              <span className="text-xs font-normal text-muted-foreground">(anti-banimento)</span>
            </CardTitle>
            <CardDescription>
              Conecte vários números (chips) para distribuir disparos automaticamente e reduzir risco de banimento.
              O sistema escolhe o chip mais "descansado" e saudável a cada envio.
            </CardDescription>
          </div>
          <Button onClick={() => setAddOpen(true)} size="sm" className="bg-green-600 hover:bg-green-700 text-white">
            <Plus className="w-4 h-4 mr-1" />
            Adicionar Instância
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Carregando pool...</span>
          </div>
        ) : (
          <>
            <WhatsAppPoolSummary instances={instances} clientId={clientId} />

            {activeCount === 1 && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <Activity className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  Você tem apenas <b>1 chip ativo</b>. Adicione mais instâncias para distribuir o volume de disparos
                  e reduzir significativamente o risco de banimento pelo WhatsApp.
                </span>
              </div>
            )}

            {instances.length === 0 ? (
              <div className="text-center py-10 border rounded-lg border-dashed">
                <Smartphone className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="font-medium">Nenhuma instância cadastrada</p>
                <p className="text-sm text-muted-foreground mt-1 mb-4">
                  Adicione seu primeiro chip para começar a enviar mensagens.
                </p>
                <Button onClick={() => setAddOpen(true)} variant="outline">
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar Primeira Instância
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {instances.map((inst) => (
                  <WhatsAppInstancePoolCard
                    key={inst.id}
                    clientId={clientId}
                    instance={inst}
                    onChange={fetchInstances}
                  />
                ))}
              </div>
            )}

            <WhatsAppWindowSettings clientId={clientId} />
          </>
        )}
      </CardContent>

      <AddInstanceDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        clientId={clientId}
        onCreated={fetchInstances}
      />
    </Card>
  );
}