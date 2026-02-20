import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

/**
 * Página de entrada do PWA instalado na tela inicial.
 * Lê o clientId salvo no localStorage e redireciona para o portal correto.
 * Se não encontrar, redireciona para a landing page.
 */
export default function PwaStart() {
  const navigate = useNavigate();

  useEffect(() => {
    const clientId = localStorage.getItem("pwa_client_id");
    if (clientId) {
      navigate(`/portal/${clientId}`, { replace: true });
    } else {
      // Fallback: sem clientId salvo, vai para landing page
      navigate("/", { replace: true });
    }
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/10 to-background">
      <div className="text-center space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
        <p className="text-muted-foreground text-sm">Carregando portal...</p>
      </div>
    </div>
  );
}
