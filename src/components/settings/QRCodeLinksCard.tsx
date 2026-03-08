import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QrCode, Copy, ExternalLink, CheckCircle2, BookUser } from "lucide-react";
import { toast } from "sonner";

interface QRCodeLinksCardProps {
  clientId: string;
}

export default function QRCodeLinksCard({ clientId }: QRCodeLinksCardProps) {
  const [copiedCRM, setCopiedCRM] = useState(false);

  const crmUrl = `${window.location.origin}/registro/${clientId}`;
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(crmUrl)}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(crmUrl);
    setCopiedCRM(true);
    toast.success("Link de cadastro CRM copiado!");
    setTimeout(() => setCopiedCRM(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <QrCode className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <CardTitle>Cadastro Público + QR Code</CardTitle>
            <CardDescription>
              Link e QR Code para captura de base política em eventos e reuniões
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-violet-100 dark:bg-violet-950/30 rounded-lg flex items-center justify-center shrink-0">
                <BookUser className="w-4 h-4 text-violet-600" />
              </div>
              <div>
                <p className="font-semibold text-sm">Cadastro CRM Público</p>
                <p className="text-xs text-muted-foreground">
                  Formulário simples para cadastro rápido em eventos — entra direto no CRM
                </p>
              </div>
            </div>
            <Badge variant="secondary" className="text-xs shrink-0">Sem login</Badge>
          </div>

          <div className="bg-muted rounded-md px-3 py-2 flex items-center justify-between gap-2">
            <code className="text-xs text-muted-foreground truncate flex-1">{crmUrl}</code>
            <div className="flex gap-1 shrink-0">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={copyToClipboard}>
                {copiedCRM ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => window.open(crmUrl, "_blank")}>
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* QR Code */}
          <div className="flex flex-col items-center gap-3 pt-2">
            <img
              src={qrApiUrl}
              alt="QR Code para cadastro público"
              className="w-48 h-48 rounded-lg border bg-white p-2"
              loading="lazy"
            />
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              Exiba este QR Code em eventos, reuniões e materiais de campanha. Apoiadores escaneiam e preenchem o cadastro pelo celular.
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 rounded-md px-3 py-2">
          💡 <strong>Fluxo:</strong> QR Code → Cadastro rápido → Confirmação no WhatsApp → Pessoa entra no CRM automaticamente.
        </p>
      </CardContent>
    </Card>
  );
}
