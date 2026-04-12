import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", { weights: ["700", "500"], subsets: ["latin"] });

const CARDS = [
  { icon: "👥", label: "Base Política", sub: "CRM completo de pessoas", color: "#3b82f6" },
  { icon: "📊", label: "Funil de Leads", sub: "Status e classificação", color: "#f59e0b" },
  { icon: "📱", label: "WhatsApp", sub: "Integração nativa", color: "#10b981" },
  { icon: "🔗", label: "Cadastro Público", sub: "QR Code & link direto", color: "#7c3aed" },
];

export const Scene3CRM: React.FC = () => {
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
          background: "linear-gradient(180deg, #f59e0b, #ef4444)",
        }} />
        <div>
          <div style={{ fontSize: 18, color: "#f59e0b", fontWeight: 500, letterSpacing: 3, textTransform: "uppercase" }}>
            Módulo 2
          </div>
          <div style={{ fontSize: 52, fontWeight: 700, color: "white", marginTop: 4 }}>
            CRM Político
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 24 }}>
        {CARDS.map((card, i) => {
          const delay = 15 + i * 10;
          const s = spring({ frame: frame - delay, fps, config: { damping: 15, stiffness: 120 } });
          const scale = interpolate(s, [0, 1], [0.8, 1]);
          const cardOpacity = interpolate(frame, [delay, delay + 12], [0, 1], { extrapolateRight: "clamp" });

          return (
            <div key={i} style={{
              flex: 1, padding: 32, borderRadius: 16,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              transform: `scale(${scale})`,
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
