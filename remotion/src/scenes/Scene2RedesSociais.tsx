import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", { weights: ["700", "500"], subsets: ["latin"] });

const CARDS = [
  { icon: "💬", label: "Comentários", sub: "Facebook & Instagram", color: "#3b82f6" },
  { icon: "🤖", label: "Respostas IA", sub: "Geração automática", color: "#7c3aed" },
  { icon: "📡", label: "Radar de Temas", sub: "Monitoramento em tempo real", color: "#10b981" },
  { icon: "🚨", label: "Detector de Crise", sub: "Alertas inteligentes", color: "#ef4444" },
];

export const Scene2RedesSociais: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const titleX = interpolate(
    spring({ frame, fps, config: { damping: 20, stiffness: 150 } }),
    [0, 1], [-60, 0]
  );

  return (
    <AbsoluteFill style={{ fontFamily, padding: 80 }}>
      {/* Section title */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16, marginBottom: 60,
        opacity: titleOpacity, transform: `translateX(${titleX}px)`,
      }}>
        <div style={{
          width: 6, height: 48, borderRadius: 3,
          background: "linear-gradient(180deg, #3b82f6, #7c3aed)",
        }} />
        <div>
          <div style={{ fontSize: 18, color: "#3b82f6", fontWeight: 500, letterSpacing: 3, textTransform: "uppercase" }}>
            Módulo 1
          </div>
          <div style={{ fontSize: 52, fontWeight: 700, color: "white", marginTop: 4 }}>
            Redes Sociais
          </div>
        </div>
      </div>

      {/* Cards grid */}
      <div style={{ display: "flex", gap: 24 }}>
        {CARDS.map((card, i) => {
          const delay = 15 + i * 10;
          const s = spring({ frame: frame - delay, fps, config: { damping: 15, stiffness: 120 } });
          const cardY = interpolate(s, [0, 1], [60, 0]);
          const cardOpacity = interpolate(frame, [delay, delay + 12], [0, 1], { extrapolateRight: "clamp" });

          return (
            <div key={i} style={{
              flex: 1, padding: 32, borderRadius: 16,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              transform: `translateY(${cardY}px)`,
              opacity: cardOpacity,
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>{card.icon}</div>
              <div style={{
                width: 40, height: 3, borderRadius: 2,
                background: card.color, marginBottom: 16,
              }} />
              <div style={{ fontSize: 24, fontWeight: 700, color: "white", marginBottom: 8 }}>
                {card.label}
              </div>
              <div style={{ fontSize: 16, color: "rgba(255,255,255,0.5)" }}>
                {card.sub}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
