import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, Link2, Users, UserCheck, Briefcase, ClipboardList } from "lucide-react";
import { toast } from "sonner";

interface PublicLinksCardProps {
  clientId: string;
}

interface LinkEntry {
  label: string;
  description: string;
  path: string;
  icon: React.ReactNode;
  color: string;
}

export default function PublicLinksCard({ clientId }: PublicLinksCardProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const baseUrl = window.location.origin;

  const links: LinkEntry[] = [
    {
      label: "Cadastro de Apoiador",
      description: "Link público para novos apoiadores se cadastrarem",
      path: `/cadastro/${clientId}`,
      icon: <Users className="w-4 h-4" />,
      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
      label: "Registro de Pessoa",
      description: "Link público para registro no CRM político",
      path: `/registro/${clientId}`,
      icon: <UserCheck className="w-4 h-4" />,
      color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Portal do Apoiador",
      description: "Acesso ao portal de missões e engajamento",
      path: `/portal/${clientId}`,
      icon: <ClipboardList className="w-4 h-4" />,
      color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    },
    {
      label: "Cadastro de Funcionário",
      description: "Link para funcionários se registrarem",
      path: `/funcionario/${clientId}`,
      icon: <Briefcase className="w-4 h-4" />,
      color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    {
      label: "Portal do Funcionário",
      description: "Acesso ao painel do funcionário",
      path: `/portal-funcionario/${clientId}`,
      icon: <Briefcase className="w-4 h-4" />,
      color: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    },
    {
      label: "Cadastro de Contratado (Líder)",
      description: "Link para líderes contratados se cadastrarem",
      path: `/contratado/${clientId}`,
      icon: <UserCheck className="w-4 h-4" />,
      color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    },
    {
      label: "Portal do Contratado",
      description: "Acesso ao painel do contratado / líder",
      path: `/portal-contratado/${clientId}`,
      icon: <ClipboardList className="w-4 h-4" />,
      color: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    },
    {
      label: "Central de Telemarketing",
      description: "Acesso dos operadores à central de ligações",
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
                className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
              >
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
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
