import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", { weights: ["700", "400"], subsets: ["latin"] });

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 15, stiffness: 120 } });
  const logoOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const tagY = interpolate(spring({ frame: frame - 20, fps, config: { damping: 20 } }), [0, 1], [30, 0]);
  const tagOpacity = interpolate(frame, [20, 35], [0, 1], { extrapolateRight: "clamp" });
  const lineW = interpolate(spring({ frame: frame - 10, fps, config: { damping: 200 } }), [0, 1], [0, 300]);
  const subOpacity = interpolate(frame, [40, 55], [0, 1], { extrapolateRight: "clamp" });
  const exitOpacity = interpolate(frame, [100, 120], [1, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{
      fontFamily, justifyContent: "center", alignItems: "center",
      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
      opacity: exitOpacity,
    }}>
      <div style={{ fontSize: 100, fontWeight: 700, color: "white", letterSpacing: -3, transform: `scale(${logoScale})`, opacity: logoOpacity }}>
        <span style={{ color: "#3b82f6" }}>S</span>entinelle
      </div>
      <div style={{ width: lineW, height: 3, background: "linear-gradient(90deg, #3b82f6, #7c3aed)", borderRadius: 2, marginTop: 12 }} />
      <div style={{ fontSize: 24, color: "rgba(255,255,255,0.7)", marginTop: 20, fontWeight: 400, letterSpacing: 6, textTransform: "uppercase", transform: `translateY(${tagY}px)`, opacity: tagOpacity }}>
        Inteligência Política Digital
      </div>
      <div style={{ fontSize: 18, color: "rgba(255,255,255,0.4)", marginTop: 30, opacity: subOpacity }}>
        Conheça todas as funcionalidades do sistema
      </div>
    </AbsoluteFill>
  );
};
