import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", { weights: ["700", "400"], subsets: ["latin"] });

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const mainScale = spring({ frame: frame - 5, fps, config: { damping: 15, stiffness: 80 } });
  const mainOpacity = interpolate(frame, [5, 25], [0, 1], { extrapolateRight: "clamp" });
  const lineW = interpolate(spring({ frame: frame - 20, fps, config: { damping: 200 } }), [0, 1], [0, 300]);
  const tagOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateRight: "clamp" });
  const logoOpacity = interpolate(frame, [50, 70], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{
      fontFamily, justifyContent: "center", alignItems: "center",
      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
    }}>
      <div style={{ fontSize: 56, fontWeight: 700, color: "white", textAlign: "center", lineHeight: 1.2, transform: `scale(${mainScale})`, opacity: mainOpacity, maxWidth: 900 }}>
        Controle total da sua{" "}
        <span style={{ background: "linear-gradient(90deg, #3b82f6, #7c3aed)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          presença digital
        </span>
      </div>
      <div style={{ width: lineW, height: 3, marginTop: 24, background: "linear-gradient(90deg, #3b82f6, #7c3aed)", borderRadius: 2 }} />
      <div style={{ fontSize: 20, color: "rgba(255,255,255,0.5)", marginTop: 24, opacity: tagOpacity, textAlign: "center" }}>
        Da moderação de redes à mobilização de campo — tudo em um só lugar.
      </div>
      <div style={{ position: "absolute", bottom: 80, opacity: logoOpacity }}>
        <div style={{ fontSize: 32, fontWeight: 700, color: "white", letterSpacing: -1 }}>
          <span style={{ color: "#3b82f6" }}>S</span>entinelle
        </div>
      </div>
    </AbsoluteFill>
  );
};
