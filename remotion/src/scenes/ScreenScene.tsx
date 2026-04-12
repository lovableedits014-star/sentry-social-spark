import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, staticFile, Img } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", { weights: ["700", "400", "500"], subsets: ["latin"] });

interface Props {
  image: string;
  title: string;
  description: string;
  category: string;
  color: string;
  index: number;
  total: number;
}

export const ScreenScene: React.FC<Props> = ({ image, title, description, category, color, index, total }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Screenshot animation
  const imgScale = interpolate(
    spring({ frame, fps, config: { damping: 20, stiffness: 100 } }),
    [0, 1], [1.05, 1]
  );
  const imgOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  // Info bar animation
  const barY = interpolate(
    spring({ frame: frame - 5, fps, config: { damping: 20, stiffness: 120 } }),
    [0, 1], [100, 0]
  );
  const barOpacity = interpolate(frame, [5, 25], [0, 1], { extrapolateRight: "clamp" });

  // Category badge animation
  const badgeScale = spring({ frame: frame - 10, fps, config: { damping: 15, stiffness: 150 } });

  // Counter
  const counterOpacity = interpolate(frame, [15, 30], [0, 1], { extrapolateRight: "clamp" });

  // Exit
  const exitOpacity = interpolate(frame, [130, 150], [1, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ fontFamily, opacity: exitOpacity }}>
      {/* Screenshot */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 140,
        overflow: "hidden",
      }}>
        <Img
          src={staticFile(image)}
          style={{
            width: "100%", height: "100%", objectFit: "cover",
            transform: `scale(${imgScale})`,
            opacity: imgOpacity,
          }}
        />
        {/* Gradient overlay at bottom */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 200,
          background: "linear-gradient(transparent, rgba(15,23,42,0.95))",
        }} />
      </div>

      {/* Info bar at bottom */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 140,
        background: "#0f172a",
        display: "flex", alignItems: "center", padding: "0 60px", gap: 30,
        transform: `translateY(${barY}px)`,
        opacity: barOpacity,
      }}>
        {/* Category badge */}
        <div style={{
          background: color,
          color: "white",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 2,
          padding: "8px 16px",
          borderRadius: 6,
          transform: `scale(${badgeScale})`,
          whiteSpace: "nowrap",
        }}>
          {category}
        </div>

        {/* Divider */}
        <div style={{ width: 2, height: 50, background: "rgba(255,255,255,0.1)" }} />

        {/* Title and description */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: "white", marginBottom: 4 }}>
            {title}
          </div>
          <div style={{ fontSize: 16, color: "rgba(255,255,255,0.6)", lineHeight: 1.4, maxWidth: 900 }}>
            {description}
          </div>
        </div>

        {/* Counter */}
        <div style={{
          fontSize: 16, color: "rgba(255,255,255,0.3)", fontWeight: 500,
          opacity: counterOpacity, whiteSpace: "nowrap",
        }}>
          {String(index).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </div>
      </div>

      {/* Accent line top */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${color}, transparent)`,
        opacity: barOpacity,
      }} />
    </AbsoluteFill>
  );
};
