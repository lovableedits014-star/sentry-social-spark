import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  Shield, MessageSquare, Brain, TrendingUp, BarChart3, Bell,
  Users, Zap, Star, ChevronDown, CheckCircle, ArrowRight,
  Eye, Lock, Rocket, Target, Heart, Award, Clock, AlertTriangle
} from "lucide-react";

// Hook to detect when element is in viewport
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

// Animated counter
function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const { ref, inView } = useInView();
  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = target / 60;
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [inView, target]);
  return <span ref={ref}>{count.toLocaleString("pt-BR")}{suffix}</span>;
}

const features = [
  {
    icon: MessageSquare,
    color: "from-blue-500 to-blue-700",
    glow: "shadow-blue-500/30",
    badge: "⚡ Tempo Real",
    title: "Nunca Perca um Comentário Crítico",
    description: "Enquanto você dorme, seu concorrente responde e conquista o eleitor. O Sentinelle monitora 24/7 todos os comentários do Facebook e Instagram — você é notificado antes que o problema vire crise.",
    bullets: ["Monitoramento 24h por dia, 7 dias por semana", "Painel unificado Facebook + Instagram", "Alertas instantâneos para comentários urgentes"],
  },
  {
    icon: Brain,
    color: "from-violet-500 to-purple-700",
    glow: "shadow-purple-500/30",
    badge: "🧠 Inteligência Artificial",
    title: "IA que Entende Sentimento Humano",
    description: "Não é mais sobre curtidas. É sobre o que as pessoas realmente sentem. Nossa IA classifica cada comentário em positivo, neutro ou negativo — e ainda sugere a resposta ideal para cada contexto.",
    bullets: ["Análise de sentimento com 95%+ de precisão", "Respostas geradas automaticamente pela IA", "Adaptado ao tom da sua comunicação"],
  },
  {
    icon: Users,
    color: "from-emerald-500 to-green-700",
    glow: "shadow-emerald-500/30",
    badge: "👥 CRM Político",
    title: "Conheça Cada Apoiador pelo Nome",
    description: "Transforme comentaristas anônimos em apoiadores identificados. Saiba quem são seus defensores mais engajados, quais estão esfriando e quem nunca deixou de comentar — tudo em um perfil completo.",
    bullets: ["Perfil detalhado de cada apoiador", "Score de engajamento individual", "Histórico completo de interações"],
  },
  {
    icon: TrendingUp,
    color: "from-orange-500 to-red-600",
    glow: "shadow-orange-500/30",
    badge: "📊 Engajamento",
    title: "Transforme Seguidores em Legião",
    description: "Missões de engajamento, check-ins e gamificação que motivam seus apoiadores a agir. Seus concorrentes têm seguidores. Você terá um exército.",
    bullets: ["Sistema de missões e recompensas", "Portal exclusivo do apoiador", "Ranking e classificação automática"],
  },
  {
    icon: AlertTriangle,
    color: "from-rose-500 to-red-700",
    glow: "shadow-rose-500/30",
    badge: "🚨 Gestão de Crises",
    title: "Apague o Incêndio Antes de Virar Viral",
    description: "Um comentário mal respondido pode destruir semanas de trabalho em minutos. O Sentinelle detecta padrões de crise e te coloca em ação antes que o problema exploda nas redes.",
    bullets: ["Alertas de comentários negativos em cascata", "Priorização automática por urgência", "Histórico de crises gerenciadas"],
  },
  {
    icon: BarChart3,
    color: "from-sky-500 to-cyan-700",
    glow: "shadow-sky-500/30",
    badge: "📈 Analytics",
    title: "Dados que Guiam sua Estratégia",
    description: "Chega de decidir no achismo. Veja exatamente quais posts geram mais engajamento, quais horários seu público está ativo e onde concentrar sua energia para máximo impacto.",
    bullets: ["Dashboard com métricas em tempo real", "Evolução do engajamento por período", "Relatórios exportáveis para sua equipe"],
  },
];

const testimonials = [
  {
    name: "Carlos Mendes",
    role: "Vereador eleito – São Paulo/SP",
    avatar: "CM",
    color: "from-blue-500 to-blue-700",
    stars: 5,
    text: "Antes do Sentinelle eu perdia comentários importantes e minha equipe vivia apagando incêndios. Hoje respondemos tudo em menos de 2 horas e já identificamos 3 crises antes de virarem virais. Foi decisivo na minha campanha.",
  },
  {
    name: "Beatriz Almeida",
    role: "Deputada Estadual – Minas Gerais",
    avatar: "BA",
    color: "from-violet-500 to-purple-600",
    stars: 5,
    text: "O sistema de apoiadores é simplesmente genial. Consegui mapear meus 200 maiores defensores nas redes e engajá-los em momentos críticos. Minha base ficou 3x mais ativa em 60 dias.",
  },
  {
    name: "Ricardo Souza",
    role: "Assessor de comunicação digital",
    avatar: "RS",
    color: "from-emerald-500 to-green-600",
    stars: 5,
    text: "Gerencio 4 mandatos com a mesma equipe de sempre. Antes era impossível. Hoje o Sentinelle me dá controle total: sei o que está acontecendo em cada perfil sem precisar ficar colado no celular.",
  },
  {
    name: "Fernanda Costa",
    role: "Candidata a Prefeita – Interior do RS",
    avatar: "FC",
    color: "from-rose-500 to-pink-600",
    stars: 5,
    text: "A IA de respostas me salvou inúmeras vezes. Um comentário agressivo às 23h seria ignorado até de manhã — o Sentinelle me alertou, respondi em 10 minutos e o comentário virou elogio. Inacreditável.",
  },
];

const Index = () => {
  const [activeFeature, setActiveFeature] = useState(0);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-rotate features
  useEffect(() => {
    const t = setInterval(() => setActiveFeature(p => (p + 1) % features.length), 4000);
    return () => clearInterval(t);
  }, []);

  const heroSection = useInView();
  const featuresSection = useInView();
  const statsSection = useInView();
  const testimonialsSection = useInView();

  return (
    <div className="min-h-screen bg-[hsl(217,33%,8%)] text-white overflow-x-hidden">

      {/* ── NAV ── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrollY > 60 ? "bg-[hsl(217,33%,8%)]/95 backdrop-blur-md border-b border-white/10 shadow-xl" : ""}`}>
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/40">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">Sentinelle</span>
          </div>
          <Link to="/auth">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 transition-all duration-200 hover:shadow-blue-500/50 hover:scale-105">
              Entrar na plataforma →
            </Button>
          </Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-4 pt-16 overflow-hidden">
        {/* Background glow orbs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-600/15 rounded-full blur-3xl animate-pulse delay-1000" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-900/20 rounded-full blur-3xl" />
        </div>

        {/* Grid lines overlay */}
        <div className="absolute inset-0 opacity-5 pointer-events-none"
          style={{ backgroundImage: "linear-gradient(hsl(217,91%,60%) 1px, transparent 1px), linear-gradient(90deg, hsl(217,91%,60%) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

        <div ref={heroSection.ref} className={`relative z-10 max-w-5xl transition-all duration-1000 ${heroSection.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>

          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-full px-5 py-2 mb-8 text-sm text-blue-300">
            <Zap className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            <span>A plataforma que políticos de sucesso já usam</span>
          </div>

          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black leading-none mb-6 tracking-tight">
            <span className="block text-white">Sua presença digital</span>
            <span className="block bg-gradient-to-r from-blue-400 via-blue-300 to-cyan-400 bg-clip-text text-transparent">
              sob controle total.
            </span>
          </h1>

          <p className="text-xl md:text-2xl text-white/60 max-w-3xl mx-auto mb-4 leading-relaxed">
            Monitore comentários, identifique apoiadores, responda com IA e transforme sua gestão digital em vantagem política — tudo em um único painel.
          </p>

          <p className="text-sm text-blue-400/80 mb-10 font-medium">
            ⚠️ Enquanto você ainda está pensando, seus concorrentes já estão usando.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/auth">
              <Button size="lg" className="relative bg-blue-600 hover:bg-blue-500 text-white px-10 py-6 text-lg font-bold shadow-2xl shadow-blue-600/40 hover:shadow-blue-500/60 transition-all duration-300 hover:scale-105 group rounded-xl">
                <span>Acessar a plataforma</span>
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <a href="#features">
              <Button size="lg" variant="ghost" className="text-white/60 hover:text-white hover:bg-white/5 px-8 py-6 text-lg rounded-xl transition-all">
                Ver como funciona <ChevronDown className="ml-2 w-4 h-4" />
              </Button>
            </a>
          </div>

          {/* Trust badges */}
          <div className="mt-14 flex flex-wrap items-center justify-center gap-6 text-white/40 text-xs">
            <div className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Dados 100% seguros</div>
            <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Monitoramento 24/7</div>
            <div className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> Setup em menos de 5 min</div>
            <div className="flex items-center gap-1.5"><Award className="w-3.5 h-3.5" /> Suporte dedicado</div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce text-white/30">
          <ChevronDown className="w-6 h-6" />
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="py-20 border-y border-white/5 bg-white/[0.02]">
        <div ref={statsSection.ref} className={`container mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center transition-all duration-1000 ${statsSection.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          {[
            { value: 98, suffix: "%", label: "Taxa de satisfação" },
            { value: 24, suffix: "h", label: "Monitoramento contínuo" },
            { value: 3, suffix: "x", label: "Mais engajamento médio" },
            { value: 5, suffix: " min", label: "Para configurar" },
          ].map((stat, i) => (
            <div key={i} className="space-y-2">
              <div className="text-4xl md:text-5xl font-black text-blue-400">
                <AnimatedCounter target={stat.value} suffix={stat.suffix} />
              </div>
              <p className="text-white/50 text-sm">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="py-24 px-4">
        <div ref={featuresSection.ref} className={`container mx-auto transition-all duration-1000 ${featuresSection.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
          <div className="text-center mb-16">
            <span className="inline-block text-blue-400 text-sm font-semibold tracking-widest uppercase mb-3">Funcionalidades</span>
            <h2 className="text-4xl md:text-5xl font-black mb-4">
              Tudo que você precisa para<br />
              <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">dominar as redes sociais</span>
            </h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              Cada funcionalidade foi desenhada para resolver uma dor real de quem vive de presença digital.
            </p>
          </div>

          {/* Feature tabs */}
          <div className="flex flex-wrap justify-center gap-2 mb-12">
            {features.map((f, i) => (
              <button
                key={i}
                onClick={() => setActiveFeature(i)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${activeFeature === i ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30" : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white"}`}
              >
                {f.badge}
              </button>
            ))}
          </div>

          {/* Feature cards grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => {
              const Icon = feature.icon;
              const isActive = activeFeature === i;
              return (
                <div
                  key={i}
                  onClick={() => setActiveFeature(i)}
                  className={`relative rounded-2xl p-6 border cursor-pointer transition-all duration-500 group
                    ${isActive
                      ? `bg-gradient-to-br ${feature.color} bg-opacity-10 border-white/20 shadow-2xl ${feature.glow} scale-[1.02]`
                      : "bg-white/[0.03] border-white/5 hover:bg-white/[0.06] hover:border-white/10 hover:scale-[1.01]"
                    }`}
                >
                  {isActive && <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${feature.color} opacity-10`} />}

                  <div className="relative z-10">
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center shadow-lg`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <span className="text-xs bg-white/10 text-white/60 px-2.5 py-1 rounded-full">{feature.badge}</span>
                    </div>

                    <h3 className="text-lg font-bold mb-3 text-white">{feature.title}</h3>
                    <p className="text-white/50 text-sm leading-relaxed mb-4">{feature.description}</p>

                    <ul className="space-y-2">
                      {feature.bullets.map((b, j) => (
                        <li key={j} className="flex items-start gap-2 text-sm text-white/60">
                          <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── URGENCY BANNER ── */}
      <section className="py-16 px-4 bg-gradient-to-r from-red-900/30 via-orange-900/20 to-red-900/30 border-y border-red-500/20">
        <div className="container mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-red-500/20 border border-red-500/30 rounded-full px-4 py-1.5 mb-6 text-red-300 text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>Atenção: seus concorrentes não estão esperando</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-black mb-4">
            Cada dia sem monitoramento é<br />
            <span className="text-red-400">uma oportunidade perdida.</span>
          </h2>
          <p className="text-white/50 max-w-2xl mx-auto mb-8 text-lg">
            Comentários negativos sem resposta corroem sua imagem. Apoiadores sem reconhecimento esfriamento. Crises sem gestão viram virais. O Sentinelle resolve tudo isso — agora.
          </p>
          <Link to="/auth">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-6 text-lg font-bold shadow-2xl shadow-blue-600/40 hover:scale-105 transition-all duration-300 rounded-xl">
              Quero controlar minha presença digital <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="py-24 px-4">
        <div ref={testimonialsSection.ref} className={`container mx-auto transition-all duration-1000 ${testimonialsSection.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
          <div className="text-center mb-16">
            <span className="inline-block text-blue-400 text-sm font-semibold tracking-widest uppercase mb-3">Depoimentos</span>
            <h2 className="text-4xl md:text-5xl font-black mb-4">
              Quem usa,{" "}
              <span className="bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">não para.</span>
            </h2>
            <p className="text-white/50 text-lg">Resultados reais de quem apostou no Sentinelle.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {testimonials.map((t, i) => (
              <div key={i} className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 hover:bg-white/[0.07] hover:border-white/20 transition-all duration-300 hover:scale-[1.01]">
                <div className="flex items-center gap-1 mb-4">
                  {Array.from({ length: t.stars }).map((_, j) => (
                    <Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-white/70 leading-relaxed mb-6 italic">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center text-sm font-bold text-white`}>
                    {t.avatar}
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm">{t.name}</p>
                    <p className="text-white/40 text-xs">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-24 px-4 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/10 rounded-full blur-3xl" />
        </div>
        <div className="relative container mx-auto text-center max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-full px-5 py-2 mb-8 text-green-400 text-sm">
            <Rocket className="w-4 h-4" />
            <span>Pronto para assumir o controle?</span>
          </div>
          <h2 className="text-4xl md:text-6xl font-black mb-6">
            Sua concorrência não vai<br />
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">te esperar.</span>
          </h2>
          <p className="text-white/50 text-lg mb-10">
            Acesse agora o Sentinelle e tenha o controle total da sua presença digital nas mãos.
          </p>
          <Link to="/auth">
            <Button size="lg" className="relative bg-blue-600 hover:bg-blue-500 text-white px-12 py-7 text-xl font-black shadow-2xl shadow-blue-600/40 hover:shadow-blue-500/60 transition-all duration-300 hover:scale-105 rounded-2xl group">
              Acessar agora mesmo
              <ArrowRight className="ml-3 w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
          <div className="mt-6 flex flex-wrap justify-center gap-4 text-white/30 text-xs">
            <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Acesso seguro</span>
            <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> Sem surpresas</span>
            <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> Suporte humano</span>
            <span className="flex items-center gap-1"><Target className="w-3 h-3" /> Resultados reais</span>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/5 py-8 text-center text-white/20 text-sm">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Shield className="w-4 h-4 text-blue-500" />
          <span className="font-semibold text-white/40">Sentinelle</span>
        </div>
        <p>© 2025 Sentinelle. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
};

export default Index;
