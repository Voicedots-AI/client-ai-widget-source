import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import {
  forwardRef,
  useImperativeHandle,
  useRef
} from "preact/compat";

export type AvatarHandle = {
  startTalking: () => void;
  stopTalking: () => void;
  triggerHover: () => void;
  stopHover: () => void;
};

export type AvatarProps = {
  lottieSrc: string;
  stateMachineId?: string;
  className?: string;
};

const DEFAULT_STATE_MACHINE_ID = "StateMachine1";



const AnimationController = forwardRef<AvatarHandle, AvatarProps>(
  ({ lottieSrc, stateMachineId = DEFAULT_STATE_MACHINE_ID, className }, ref) => {
    const dotLottieRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      startTalking() {
        // Targets the 'talking' boolean in your Lottie State Machine
        dotLottieRef.current?.stateMachineSetBooleanInput?.("talking", true);
      },
      stopTalking() {
        dotLottieRef.current?.stateMachineSetBooleanInput?.("talking", false);
      },
      triggerHover() {
        // Resets talking and triggers the hover state
        if (dotLottieRef.current) {
          dotLottieRef.current.stateMachineSetBooleanInput("talking", false);
          dotLottieRef.current.stateMachineSetBooleanInput("hover", true);
        }
      },
      stopHover() {
        if (dotLottieRef.current) {
          dotLottieRef.current.stateMachineSetBooleanInput("hover", false);
        }
      }
    }));

    return (
      <div className={className || "vd-lottie-container"}>
        <DotLottieReact
          src={lottieSrc}
          autoplay
          loop
          stateMachineId={stateMachineId}
          dotLottieRefCallback={(dotLottie: any) => {
            dotLottieRef.current = dotLottie;
          }}
        />
      </div>
    );
  }
);

export default AnimationController;