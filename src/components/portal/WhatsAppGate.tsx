import { useState } from "react";
import { supabase } from "@/integrations/supabase/client-selfhosted";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, MessageCircle, ShieldCheck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface WhatsAppGateProps {
  clientId: string;
  clientName?: string;
  clientLogo?: string | null;
  role: "apoiador" | "funcionario" | "contratado";
  userName: string;
  /** Called after the user confirms — parent should refetch / unlock the portal */
  onConfirmed: () => void;
}

/**
 * Full-screen blocking overlay shown the first time a user accesses the portal.
 * Forces the user to send a message to the campaign's official WhatsApp number
 * before unlocking the portal — protects the main number from being banned.
 */
export default function WhatsAppGate({
  clientId,
  clientName,
  clientLogo,
  role,
  userName,
  onConfirmed,
}: WhatsAppGateProps) {
  const [loading, setLoading] = useState(false);
  const [opened, setOpened] = useState(false);

  const roleLabel =
    role === "funcionario" ? "funcionário" : role === "contratado" ? "contratado" : "apoiador";

  const handleOpenWhatsApp = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("resolve-whatsapp-link", {
        body: { client_id: clientId, role },
      });
      if (error) throw error;
      const waUrl = data?.wa_url as string | undefined;
      if (!waUrl) {
        toast.error("WhatsApp Oficial não configurado para esta campanha.");
        return;
      }
      const msg = `Olá! Sou ${userName}, confirmando meu cadastro como ${roleLabel}${
        clientName ? ` em ${clientName}` : ""
      }.`;
      window.open(`${waUrl}?text=${encodeURIComponent(msg)}`, "_blank");
      setOpened(true);
      toast.success("Envie a mensagem no WhatsApp e volte aqui para liberar o portal.");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao abrir WhatsApp");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    toast.success("WhatsApp confirmado! Liberando portal...");
    onConfirmed();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <Card className="w-full max-w-md shadow-2xl border-primary/30">
        <CardContent className="pt-8 pb-6 space-y-5 text-center">
          <div className="w-20 h-20 rounded-2xl mx-auto overflow-hidden bg-primary flex items-center justify-center shadow-lg">
            {clientLogo ? (
              <img src={clientLogo} alt="" className="w-full h-full object-cover" />
            ) : (
              <ShieldCheck className="w-10 h-10 text-primary-foreground" />
            )}
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Confirme seu WhatsApp</h2>
            <p className="text-sm text-muted-foreground">
              Para liberar seu portal, envie uma mensagem no WhatsApp Oficial da campanha
              {clientName ? ` ${clientName}` : ""}.
            </p>
          </div>

          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 p-4 text-left space-y-2">
            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
              Como funciona
            </p>
            <ol className="text-sm text-emerald-900 dark:text-emerald-200 space-y-1 list-decimal list-inside">
              <li>Toque no botão verde abaixo</li>
              <li>Envie a mensagem que aparecerá automaticamente</li>
              <li>Volte aqui e toque em "Já enviei"</li>
            </ol>
          </div>

          <Button
            onClick={handleOpenWhatsApp}
            disabled={loading}
            size="lg"
            className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <MessageCircle className="w-5 h-5" />
            )}
            {opened ? "Reabrir WhatsApp" : "Abrir WhatsApp Oficial"}
          </Button>

          {opened && (
            <Button
              onClick={handleConfirm}
              variant="outline"
              size="lg"
              className="w-full gap-2 border-emerald-500 text-emerald-700 hover:bg-emerald-50"
            >
              <CheckCircle2 className="w-5 h-5" />
              Já enviei — liberar portal
            </Button>
          )}

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            🔒 Essa etapa protege o número principal da campanha contra bloqueios e garante
            comunicação ativa com você.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}