import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";

// 10 screens × 150 frames each + transitions = ~1500 frames (~50s at 30fps)
export const RemotionRoot = () => (
  <Composition
    id="main"
    component={MainVideo}
    durationInFrames={1800}
    fps={30}
    width={1920}
    height={1080}
  />
);
