import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";

export const PersistentBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 750], [0, 40]);
  const drift2 = interpolate(frame, [0, 750], [0, -30]);

  return (
    <AbsoluteFill style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)" }}>
      {/* Subtle grid */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.04,
        backgroundImage: "linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)",
        backgroundSize: "80px 80px",
        transform: `translate(${drift}px, ${drift2}px)`,
      }} />
      {/* Accent glow top-right */}
      <div style={{
        position: "absolute", top: -200, right: -200,
        width: 600, height: 600, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(26,86,219,0.15) 0%, transparent 70%)",
        transform: `translate(${Math.sin(frame * 0.02) * 20}px, ${Math.cos(frame * 0.015) * 15}px)`,
      }} />
      {/* Accent glow bottom-left */}
      <div style={{
        position: "absolute", bottom: -150, left: -150,
        width: 500, height: 500, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(124,58,237,0.1) 0%, transparent 70%)",
        transform: `translate(${Math.cos(frame * 0.018) * 15}px, ${Math.sin(frame * 0.022) * 10}px)`,
      }} />
    </AbsoluteFill>
  );
};
