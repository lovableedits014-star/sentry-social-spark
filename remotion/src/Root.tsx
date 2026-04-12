import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";

// 25s at 30fps = 750 frames, minus transition overlaps (5 transitions * 15 frames = 75)
// Total: ~750 frames
export const RemotionRoot = () => (
  <Composition
    id="main"
    component={MainVideo}
    durationInFrames={750}
    fps={30}
    width={1920}
    height={1080}
  />
);
