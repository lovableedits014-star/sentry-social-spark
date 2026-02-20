import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Loader2, Users, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Página de entrada do PWA instalado na tela inicial.
 * Lê o clientId salvo no localStorage e redireciona para o portal correto.
 * Se não encontrar, mostra opção de escolha (apoiador ou admin).
 */
export default function PwaStart() {
  const navigate = useNavigate();
  const [showChoice, setShowChoice] = useState(false);

  useEffect(() => {
    const clientId = localStorage.getItem("pwa_client_id");
    if (clientId) {
      navigate(`/portal/${clientId}`, { replace: true });
    } else {
      // Sem clientId: mostrar tela de escolha
      setShowChoice(true);
    }
  }, [navigate]);

  if (!showChoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/10 to-background">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground text-sm">Carregando portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-primary/10 to-background p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto shadow-lg">
          <Shield className="w-8 h-8 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Sentinelle</h1>
          <p className="text-muted-foreground text-sm mt-1">Como deseja acessar?</p>
        </div>

        <div className="space-y-3">
          {/* Opção Apoiador */}
          <Link to="/" className="block">
            <div className="border-2 border-primary/20 rounded-xl p-5 text-left hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Sou Apoiador</p>
                  <p className="text-xs text-muted-foreground">Acesse o portal de engajamento com o link recebido do seu coordenador</p>
                </div>
              </div>
            </div>
          </Link>

          {/* Opção Admin */}
          <Link to="/auth" className="block">
            <div className="border-2 border-muted rounded-xl p-5 text-left hover:border-muted-foreground/30 hover:bg-muted/30 transition-all cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center shrink-0">
                  <Shield className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Sou Administrador</p>
                  <p className="text-xs text-muted-foreground">Acesse o painel de gerenciamento do Sentinelle</p>
                </div>
              </div>
            </div>
          </Link>
        </div>

        <p className="text-xs text-muted-foreground">
          Apoiador: use o link específico do seu portal para instalar o app corretamente
        </p>
      </div>
    </div>
  );
}
