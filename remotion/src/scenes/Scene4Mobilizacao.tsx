import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", { weights: ["700", "500"], subsets: ["latin"] });

const CARDS = [
  { icon: "🎯", label: "Missões IA", sub: "Engajamento dirigido", color: "#7c3aed" },
  { icon: "🔄", label: "Multiplicadores", sub: "Rede de indicações", color: "#3b82f6" },
  { icon: "🏆", label: "Ranking", sub: "Gamificação de apoiadores", color: "#f59e0b" },
  { icon: "✅", label: "Check-in Diário", sub: "Presença e atividade", color: "#10b981" },
];

export const Scene4Mobilizacao: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const titleX = interpolate(
    spring({ frame, fps, config: { damping: 20, stiffness: 150 } }),
    [0, 1], [-60, 0]
  );

  return (
    <AbsoluteFill style={{ fontFamily, padding: 80 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 16, marginBottom: 60,
        opacity: titleOpacity, transform: `translateX(${titleX}px)`,
      }}>
        <div style={{
          width: 6, height: 48, borderRadius: 3,
          background: "linear-gradient(180deg, #7c3aed, #3b82f6)",
        }} />
        <div>
          <div style={{ fontSize: 18, color: "#7c3aed", fontWeight: 500, letterSpacing: 3, textTransform: "uppercase" }}>
            Módulo 3
          </div>
          <div style={{ fontSize: 52, fontWeight: 700, color: "white", marginTop: 4 }}>
            Mobilização
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 24 }}>
        {CARDS.map((card, i) => {
          const delay = 10 + i * 8;
          const s = spring({ frame: frame - delay, fps, config: { damping: 12, stiffness: 100 } });
          const cardX = interpolate(s, [0, 1], [100, 0]);
          const cardOpacity = interpolate(frame, [delay, delay + 10], [0, 1], { extrapolateRight: "clamp" });

          return (
            <div key={i} style={{
              flex: 1, padding: 32, borderRadius: 16,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              transform: `translateX(${cardX}px)`,
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
