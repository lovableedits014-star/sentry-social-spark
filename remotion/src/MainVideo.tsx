import { AbsoluteFill } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { wipe } from "@remotion/transitions/wipe";
import { slide } from "@remotion/transitions/slide";
import { fade } from "@remotion/transitions/fade";
import { Scene1Abertura } from "./scenes/Scene1Abertura";
import { Scene2RedesSociais } from "./scenes/Scene2RedesSociais";
import { Scene3CRM } from "./scenes/Scene3CRM";
import { Scene4Mobilizacao } from "./scenes/Scene4Mobilizacao";
import { Scene5Operacional } from "./scenes/Scene5Operacional";
import { Scene6Encerramento } from "./scenes/Scene6Encerramento";
import { PersistentBackground } from "./components/PersistentBackground";

const TRANSITION_DURATION = 15;
const springConfig = { damping: 200 };

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill>
      <PersistentBackground />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={90}>
          <Scene1Abertura />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-right" })}
          timing={springTiming({ config: springConfig, durationInFrames: TRANSITION_DURATION })}
        />

        <TransitionSeries.Sequence durationInFrames={120}>
          <Scene2RedesSociais />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={springTiming({ config: springConfig, durationInFrames: TRANSITION_DURATION })}
        />

        <TransitionSeries.Sequence durationInFrames={120}>
          <Scene3CRM />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-left" })}
          timing={springTiming({ config: springConfig, durationInFrames: TRANSITION_DURATION })}
        />

        <TransitionSeries.Sequence durationInFrames={120}>
          <Scene4Mobilizacao />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={springTiming({ config: springConfig, durationInFrames: TRANSITION_DURATION })}
        />

        <TransitionSeries.Sequence durationInFrames={150}>
          <Scene5Operacional />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={springTiming({ config: springConfig, durationInFrames: TRANSITION_DURATION })}
        />

        <TransitionSeries.Sequence durationInFrames={225}>
          <Scene6Encerramento />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
