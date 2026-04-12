import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", { weights: ["700", "400"], subsets: ["latin"] });

export const Scene6Encerramento: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const mainScale = spring({ frame: frame - 5, fps, config: { damping: 15, stiffness: 80 } });
  const mainOpacity = interpolate(frame, [5, 25], [0, 1], { extrapolateRight: "clamp" });

  const tagY = interpolate(
    spring({ frame: frame - 30, fps, config: { damping: 20, stiffness: 100 } }),
    [0, 1], [40, 0]
  );
  const tagOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateRight: "clamp" });

  const lineWidth = interpolate(
    spring({ frame: frame - 20, fps, config: { damping: 200 } }),
    [0, 1], [0, 300]
  );

  const logoOpacity = interpolate(frame, [60, 80], [0, 1], { extrapolateRight: "clamp" });
  const logoScale = spring({ frame: frame - 60, fps, config: { damping: 20, stiffness: 120 } });

  // Subtle pulse on the logo at the end
  const pulse = interpolate(Math.sin(frame * 0.08), [-1, 1], [0.97, 1.03]);

  return (
    <AbsoluteFill style={{ fontFamily, justifyContent: "center", alignItems: "center" }}>
      {/* Main CTA */}
      <div style={{
        fontSize: 64, fontWeight: 700, color: "white",
        textAlign: "center", lineHeight: 1.2,
        transform: `scale(${mainScale})`,
        opacity: mainOpacity,
        maxWidth: 900,
      }}>
        Controle total da sua{" "}
        <span style={{
          background: "linear-gradient(90deg, #3b82f6, #7c3aed)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>
          presença digital
        </span>
      </div>

      {/* Accent line */}
      <div style={{
        width: lineWidth, height: 3, marginTop: 24,
        background: "linear-gradient(90deg, #3b82f6, #7c3aed)",
        borderRadius: 2,
      }} />

      {/* Tagline */}
      <div style={{
        fontSize: 24, color: "rgba(255,255,255,0.6)", marginTop: 24,
        fontWeight: 400,
        transform: `translateY(${tagY}px)`,
        opacity: tagOpacity,
      }}>
        Da moderação de redes à mobilização de campo — tudo em um só lugar.
      </div>

      {/* Logo at the bottom */}
      <div style={{
        position: "absolute", bottom: 80,
        opacity: logoOpacity,
        transform: `scale(${logoScale * pulse})`,
      }}>
        <div style={{ fontSize: 36, fontWeight: 700, color: "white", letterSpacing: -1 }}>
          <span style={{ color: "#3b82f6" }}>S</span>entinelle
        </div>
        <div style={{
          fontSize: 14, color: "rgba(255,255,255,0.4)",
          textAlign: "center", marginTop: 4, letterSpacing: 4, textTransform: "uppercase",
        }}>
          sentinelle.com.br
        </div>
      </div>
    </AbsoluteFill>
  );
};
