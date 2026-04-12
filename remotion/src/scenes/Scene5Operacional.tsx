import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", { weights: ["700", "500"], subsets: ["latin"] });

const CARDS = [
  { icon: "📋", label: "Campanha", sub: "Kanban de tarefas", color: "#3b82f6" },
  { icon: "👷", label: "Contratados", sub: "Gestão de equipe", color: "#f59e0b" },
  { icon: "🗺️", label: "Territorial", sub: "Mapeamento por região", color: "#10b981" },
  { icon: "📈", label: "IED", sub: "Índice de Desempenho", color: "#7c3aed" },
  { icon: "📞", label: "Telemarketing", sub: "Ligações e resultados", color: "#ef4444" },
];

export const Scene5Operacional: React.FC = () => {
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
        display: "flex", alignItems: "center", gap: 16, marginBottom: 50,
        opacity: titleOpacity, transform: `translateX(${titleX}px)`,
      }}>
        <div style={{
          width: 6, height: 48, borderRadius: 3,
          background: "linear-gradient(180deg, #10b981, #f59e0b)",
        }} />
        <div>
          <div style={{ fontSize: 18, color: "#10b981", fontWeight: 500, letterSpacing: 3, textTransform: "uppercase" }}>
            Módulo 4
          </div>
          <div style={{ fontSize: 52, fontWeight: 700, color: "white", marginTop: 4 }}>
            Operacional & Inteligência
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {CARDS.map((card, i) => {
          const delay = 12 + i * 8;
          const s = spring({ frame: frame - delay, fps, config: { damping: 15, stiffness: 120 } });
          const cardY = interpolate(s, [0, 1], [50, 0]);
          const cardOpacity = interpolate(frame, [delay, delay + 10], [0, 1], { extrapolateRight: "clamp" });
          const isLastRow = i >= 3;

          return (
            <div key={i} style={{
              width: isLastRow ? "calc(50% - 10px)" : "calc(33.33% - 14px)",
              padding: 28, borderRadius: 16,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              transform: `translateY(${cardY}px)`,
              opacity: cardOpacity,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ fontSize: 40 }}>{card.icon}</div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "white" }}>{card.label}</div>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{card.sub}</div>
                </div>
              </div>
              <div style={{
                width: "100%", height: 3, borderRadius: 2, marginTop: 16,
                background: `linear-gradient(90deg, ${card.color}, transparent)`,
              }} />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
