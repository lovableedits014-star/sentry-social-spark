import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Shield, MessageSquare, Brain, TrendingUp, BarChart3, Bell } from "lucide-react";
import heroBg from "@/assets/hero-bg.jpg";
const Index = () => {
  return <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden" style={{
      backgroundImage: `linear-gradient(rgba(30, 64, 175, 0.85), rgba(30, 64, 175, 0.95)), url(${heroBg})`,
      backgroundSize: "cover",
      backgroundPosition: "center"
    }}>
        <div className="container mx-auto px-4 text-center text-white relative z-10">
          <div className="mb-6 inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-6 py-2 border border-white/20">
            <Shield className="w-5 h-5" />
            <span className="text-sm font-medium">Monitoramento Inteligente</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            Sentinelle
          </h1>
          
          <p className="text-xl md:text-2xl mb-8 text-white/90 max-w-3xl mx-auto">
            Monitore, analise e responda comentários em redes sociais com inteligência artificial
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/auth">
              <Button size="lg" className="bg-white text-primary hover:bg-white/90 shadow-xl">
                Começar Agora
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="border-white/30 text-blue-800 bg-slate-50">
              Saiba Mais
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Monitoramento Profissional para Sua Presença Digital
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Sentinelle oferece ferramentas completas para gerenciar sua reputação online
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-card rounded-xl p-6 border shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <MessageSquare className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Monitoramento em Tempo Real</h3>
              <p className="text-muted-foreground">
                Acompanhe todos os comentários do Facebook e Instagram em um único painel
              </p>
            </div>

            <div className="bg-card rounded-xl p-6 border shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mb-4">
                <Brain className="w-6 h-6 text-accent" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Análise de Sentimento com IA</h3>
              <p className="text-muted-foreground">
                Classificação automática em positivo, neutro e negativo usando modelos avançados
              </p>
            </div>

            <div className="bg-card rounded-xl p-6 border shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center mb-4">
                <TrendingUp className="w-6 h-6 text-success" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Respostas Inteligentes</h3>
              <p className="text-muted-foreground">
                Gere respostas empáticas e profissionais automaticamente com IA
              </p>
            </div>

            <div className="bg-card rounded-xl p-6 border shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-warning/10 rounded-lg flex items-center justify-center mb-4">
                <BarChart3 className="w-6 h-6 text-warning" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Dashboard Completo</h3>
              <p className="text-muted-foreground">
                Visualize métricas e tendências da sua presença nas redes sociais
              </p>
            </div>

            <div className="bg-card rounded-xl p-6 border shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-destructive/10 rounded-lg flex items-center justify-center mb-4">
                <Bell className="w-6 h-6 text-destructive" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Alertas de Crises</h3>
              <p className="text-muted-foreground">
                Receba notificações imediatas de comentários negativos importantes
              </p>
            </div>

            <div className="bg-card rounded-xl p-6 border shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Multi-Tenant Seguro</h3>
              <p className="text-muted-foreground">
                Dados isolados e criptografados para cada cliente com total segurança
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Pronto para Transformar Sua Gestão de Redes Sociais?
          </h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            Comece agora e tenha controle total sobre seus comentários e engajamento
          </p>
          <Link to="/auth">
            <Button size="lg" className="bg-white text-primary hover:bg-white/90">
              Criar Conta Grátis
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t bg-card">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>&copy; 2025 Sentinelle. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>;
};
export default Index;