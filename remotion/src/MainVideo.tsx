import { AbsoluteFill, Series, Sequence } from "remotion";
import { ScreenScene } from "./scenes/ScreenScene";
import { IntroScene } from "./scenes/IntroScene";
import { OutroScene } from "./scenes/OutroScene";

const SCREENS = [
  {
    image: "screens/01-dashboard.png",
    title: "Dashboard",
    description: "Visão geral com métricas de sentimento, IED, mobilização e gráficos de evolução.",
    category: "VISÃO GERAL",
    color: "#3b82f6",
  },
  {
    image: "screens/02-comentarios.png",
    title: "Comentários",
    description: "Todos os comentários do Facebook e Instagram centralizados. Filtre por sentimento, gere respostas com IA e responda direto pela plataforma.",
    category: "REDES SOCIAIS",
    color: "#3b82f6",
  },
  {
    image: "screens/03-engajamento.png",
    title: "Engajamento & Ranking",
    description: "Ranking automático dos maiores apoiadores. O sistema detecta influenciadores com base em curtidas, comentários e compartilhamentos.",
    category: "REDES SOCIAIS",
    color: "#7c3aed",
  },
  {
    image: "screens/04-radar.png",
    title: "Radar de Temas",
    description: "Monitora automaticamente os assuntos mais comentados. Cada tema mostra menções, sentimento predominante e palavras-chave.",
    category: "REDES SOCIAIS",
    color: "#10b981",
  },
  {
    image: "screens/05-crise.png",
    title: "Detector de Crise",
    description: "Monitora picos de negatividade em tempo real. Gera alertas automáticos e resumos executivos com IA quando identifica crises.",
    category: "REDES SOCIAIS",
    color: "#ef4444",
  },
  {
    image: "screens/06-pessoas.png",
    title: "Base Política (CRM)",
    description: "CRM completo com 15+ filtros. Classifique eleitores, apoiadores, lideranças e voluntários. Controle nível de apoio e status de cada lead.",
    category: "BASE POLÍTICA",
    color: "#f59e0b",
  },
  {
    image: "screens/07-missoes.png",
    title: "Missões Inteligentes",
    description: "A IA analisa temas em alta e sugere missões de engajamento. Seus apoiadores recebem as missões pelo portal exclusivo.",
    category: "MOBILIZAÇÃO",
    color: "#7c3aed",
  },
  {
    image: "screens/08-disparos.png",
    title: "Disparos WhatsApp",
    description: "Envie mensagens em massa personalizadas. Segmente por tags, escolha política de envio anti-banimento e acompanhe o histórico.",
    category: "OPERACIONAL",
    color: "#10b981",
  },
  {
    image: "screens/09-contratados.png",
    title: "Contratados",
    description: "Gestão de equipe de campo com hierarquia de líderes. Cada contratado recebe link único para indicar pessoas verificadas por telemarketing.",
    category: "OPERACIONAL",
    color: "#f59e0b",
  },
  {
    image: "screens/10-territorial.png",
    title: "Base & Território",
    description: "Acompanhe o crescimento da base, distribuição por origem e mapeamento geográfico com zonas de calor por bairro.",
    category: "OPERACIONAL",
    color: "#3b82f6",
  },
  {
    image: "screens/11-settings.png",
    title: "Configurações",
    description: "Integração WhatsApp com QR Code, Meta (Facebook/Instagram), modelos de IA, equipe com controle de acesso e links públicos.",
    category: "SISTEMA",
    color: "#64748b",
  },
];

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "#0f172a" }}>
      <Series>
        <Series.Sequence durationInFrames={120}>
          <IntroScene />
        </Series.Sequence>

        {SCREENS.map((screen, i) => (
          <Series.Sequence key={i} durationInFrames={150}>
            <ScreenScene
              image={screen.image}
              title={screen.title}
              description={screen.description}
              category={screen.category}
              color={screen.color}
              index={i + 1}
              total={SCREENS.length}
            />
          </Series.Sequence>
        ))}

        <Series.Sequence durationInFrames={120}>
          <OutroScene />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
