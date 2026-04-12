import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", { weights: ["700", "400"], subsets: ["latin"] });

export const Scene1Abertura: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 15, stiffness: 120 } });
  const logoOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  const taglineY = interpolate(
    spring({ frame: frame - 20, fps, config: { damping: 20, stiffness: 100 } }),
    [0, 1], [30, 0]
  );
  const taglineOpacity = interpolate(frame, [20, 35], [0, 1], { extrapolateRight: "clamp" });

  const lineWidth = interpolate(
    spring({ frame: frame - 10, fps, config: { damping: 200 } }),
    [0, 1], [0, 200]
  );

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", fontFamily }}>
      {/* Logo text */}
      <div style={{
        fontSize: 120, fontWeight: 700, color: "white",
        letterSpacing: -3,
        transform: `scale(${logoScale})`,
        opacity: logoOpacity,
      }}>
        <span style={{ color: "#3b82f6" }}>S</span>entinelle
      </div>

      {/* Accent line */}
      <div style={{
        width: lineWidth, height: 3,
        background: "linear-gradient(90deg, #3b82f6, #7c3aed)",
        borderRadius: 2, marginTop: 12,
      }} />

      {/* Tagline */}
      <div style={{
        fontSize: 28, color: "rgba(255,255,255,0.7)", marginTop: 20,
        fontWeight: 400, letterSpacing: 6, textTransform: "uppercase",
        transform: `translateY(${taglineY}px)`,
        opacity: taglineOpacity,
      }}>
        Inteligência Política Digital
      </div>
    </AbsoluteFill>
  );
};
