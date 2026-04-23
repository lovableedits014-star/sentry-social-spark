import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, Link2, Users, UserCheck, Briefcase, ClipboardList, QrCode, Printer, Download } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { QRCodeCanvas } from "qrcode.react";

interface PublicLinksCardProps {
  clientId: string;
}

interface LinkEntry {
  label: string;
  description: string;
  detail: string;
  path: string;
  icon: React.ReactNode;
  color: string;
}

export default function PublicLinksCard({ clientId }: PublicLinksCardProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [qrLink, setQrLink] = useState<LinkEntry | null>(null);

  const baseUrl = window.location.origin;

  const links: LinkEntry[] = [
    {
      label: "Cadastro de Apoiador",
      description: "Link público para novos apoiadores se cadastrarem",
      detail: "Envie este link para qualquer pessoa que queira se tornar apoiador da campanha. Ao acessar, o visitante preenche nome, telefone e dados básicos. Após o cadastro, ele é redirecionado automaticamente para o Portal do Apoiador onde já pode começar a realizar missões de engajamento. Este link pode ser compartilhado em redes sociais, WhatsApp, materiais impressos, etc. Cada pessoa cadastrada entra na sua base política do CRM.",
      path: `/cadastro/${clientId}`,
      icon: <Users className="w-4 h-4" />,
      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
      label: "Registro de Pessoa (CRM)",
      description: "Formulário público de registro direto no CRM político",
      detail: "Link alternativo de cadastro que registra a pessoa diretamente na base política (CRM de Pessoas) com campos mais completos: endereço, bairro, cidade, zona/seção eleitoral, intenção de voto e classificação política. Ideal para uso em ações de campo, eventos e porta-a-porta onde o cabo eleitoral coleta informações detalhadas. Diferente do cadastro de apoiador, este foco é na inteligência política e mapeamento territorial.",
      path: `/registro/${clientId}`,
      icon: <UserCheck className="w-4 h-4" />,
      color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Portal do Apoiador",
      description: "Painel de missões e engajamento para apoiadores cadastrados",
      detail: "Este é o painel onde apoiadores já cadastrados acessam suas missões de engajamento: curtir, comentar e compartilhar publicações nas redes sociais do candidato. O apoiador faz login com o telefone cadastrado, visualiza as missões ativas, cumpre as tarefas e sobe no ranking de engajamento. Também permite gerar um link de indicação para convidar outros apoiadores (sistema de multiplicadores). Funciona como PWA — pode ser instalado no celular como um app.",
      path: `/portal/${clientId}`,
      icon: <ClipboardList className="w-4 h-4" />,
      color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    },
    {
      label: "Cadastro de Funcionário",
      description: "Link para funcionários da campanha se registrarem no sistema",
      detail: "Envie este link para os funcionários fixos da campanha (assessores, coordenadores, equipe de gabinete). Ao se cadastrar, o funcionário recebe um código de indicação exclusivo para recrutar apoiadores — cada pessoa que ele indicar é vinculada automaticamente ao seu perfil, alimentando o ranking de influenciadores. Funcionários têm obrigatoriedade de presença (check-in diário) e participação nas missões de engajamento.",
      path: `/funcionario/${clientId}`,
      icon: <Briefcase className="w-4 h-4" />,
      color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    {
      label: "Portal do Funcionário",
      description: "Painel de gestão do funcionário com check-in e indicações",
      detail: "Painel exclusivo do funcionário já cadastrado. Aqui ele realiza o check-in diário de presença, visualiza suas missões de engajamento ativas, acompanha quantas pessoas já indicou e compartilha seu link de indicação personalizado. O funcionário também pode ver seu desempenho no ranking de influenciadores. O acesso é feito com o telefone cadastrado — sem necessidade de senha.",
      path: `/portal-funcionario/${clientId}`,
      icon: <Briefcase className="w-4 h-4" />,
      color: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    },
    {
      label: "Cadastro de Contratado (Líder)",
      description: "Link para líderes contratados se cadastrarem como multiplicadores",
      detail: "Este link é destinado aos líderes contratados — pessoas remuneradas que têm a obrigação de indicar um número mínimo de contatos (quota de indicados). Ao se cadastrar, o líder recebe acesso ao Portal do Contratado onde pode adicionar seus indicados (nome, telefone, bairro). Cada líder tem uma meta de indicações e seus indicados entram automaticamente na fila do telemarketing para verificação de voto. Para cadastrar liderados (sub-contratados vinculados a um líder), use o formato: /contratado/{clientId}/{liderId}.",
      path: `/contratado/${clientId}`,
      icon: <UserCheck className="w-4 h-4" />,
      color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    },
    {
      label: "Portal do Contratado",
      description: "Painel do líder contratado para gerenciar indicados e check-in",
      detail: "Painel onde o líder contratado gerencia seus indicados: adiciona novos contatos, acompanha o progresso da sua quota, realiza check-in diário e visualiza o status de verificação dos seus indicados pelo telemarketing. O líder também pode ver quais indicados já foram ligados, quais confirmaram voto e quais recusaram. Acesso via telefone cadastrado. É o hub central de produtividade do contratado.",
      path: `/portal-contratado/${clientId}`,
      icon: <ClipboardList className="w-4 h-4" />,
      color: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    },
    {
      label: "Central de Telemarketing",
      description: "Acesso dos operadores à fila unificada de ligações",
      detail: "Link para os operadores de telemarketing acessarem a central de ligações. A fila exibe todos os contatos pendentes: líderes, liderados e indicados que ainda não receberam ligação. O operador registra o resultado de cada chamada (atendeu, não atendeu, recusou), a intenção de voto e observações. Contatos que já foram atendidos saem permanentemente da fila. O acesso é controlado pelos operadores cadastrados em Configurações > Central de Telemarketing.",
      path: `/telemarketing/${clientId}`,
      icon: <Link2 className="w-4 h-4" />,
      color: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    },
  ];

  const handleCopy = (url: string, index: number) => {
    navigator.clipboard.writeText(url);
    setCopiedIndex(index);
    toast.success("Link copiado!");
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const qrUrl = qrLink ? `${baseUrl}${qrLink.path}` : "";

  const handleDownloadQr = () => {
    const canvas = document.getElementById("qr-print-canvas") as HTMLCanvasElement | null;
    if (!canvas || !qrLink) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `qrcode-${qrLink.label.toLowerCase().replace(/\s+/g, "-")}.png`;
    a.click();
  };

  const handlePrintQr = () => {
    const canvas = document.getElementById("qr-print-canvas") as HTMLCanvasElement | null;
    if (!canvas || !qrLink) return;
    const dataUrl = canvas.toDataURL("image/png");
    const w = window.open("", "_blank", "width=600,height=700");
    if (!w) {
      toast.error("Permita pop-ups para imprimir");
      return;
    }
    w.document.write(`
      <html><head><title>QR Code - ${qrLink.label}</title>
      <style>
        body { font-family: system-ui, sans-serif; text-align: center; padding: 40px; }
        h1 { font-size: 22px; margin-bottom: 4px; }
        p { color: #555; font-size: 13px; margin: 4px 0 24px; }
        img { width: 320px; height: 320px; }
        .url { margin-top: 20px; font-family: monospace; font-size: 12px; word-break: break-all; color: #333; }
        @media print { body { padding: 0; } }
      </style></head><body>
        <h1>${qrLink.label}</h1>
        <p>${qrLink.description}</p>
        <img src="${dataUrl}" alt="QR Code" />
        <div class="url">${qrUrl}</div>
        <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); }</script>
      </body></html>
    `);
    w.document.close();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Link2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>Links de Acesso Público</CardTitle>
            <CardDescription>
              Todos os links de cadastro e portais para compartilhar com sua equipe e apoiadores
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {links.map((link, i) => {
            const fullUrl = `${baseUrl}${link.path}`;
            const isCopied = copiedIndex === i;
            return (
              <div
                key={i}
                className="rounded-lg border bg-muted/30 overflow-hidden"
              >
                <div className="flex items-center gap-3 p-3">
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${link.color}`}>
                    {link.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight">{link.label}</p>
                    <p className="text-xs text-muted-foreground">{link.description}</p>
                  </div>
                  <Input
                    readOnly
                    value={fullUrl}
                    className="max-w-[320px] text-xs font-mono bg-background h-8 hidden sm:block"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 h-8 w-8 p-0"
                    onClick={() => handleCopy(fullUrl, i)}
                  >
                    {isCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 h-8 w-8 p-0"
                    onClick={() => setQrLink(link)}
                    title="Gerar QR Code"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="px-3 pb-3 pt-0">
                  <p className="text-xs text-muted-foreground/80 leading-relaxed bg-background/50 rounded-md p-2 border border-border/50">
                    {link.detail}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
      <Dialog open={!!qrLink} onOpenChange={(open) => !open && setQrLink(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>QR Code — {qrLink?.label}</DialogTitle>
            <DialogDescription>
              Escaneie com a câmera do celular ou imprima para distribuir.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="bg-white p-4 rounded-lg border">
              {qrLink && (
                <QRCodeCanvas
                  id="qr-print-canvas"
                  value={qrUrl}
                  size={256}
                  level="H"
                  includeMargin={false}
                />
              )}
            </div>
            <p className="text-xs font-mono text-muted-foreground text-center break-all px-2">
              {qrUrl}
            </p>
            <div className="flex gap-2 w-full">
              <Button variant="outline" className="flex-1" onClick={handleDownloadQr}>
                <Download className="w-4 h-4 mr-2" /> Baixar PNG
              </Button>
              <Button className="flex-1" onClick={handlePrintQr}>
                <Printer className="w-4 h-4 mr-2" /> Imprimir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
