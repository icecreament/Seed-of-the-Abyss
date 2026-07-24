import Phaser from 'phaser';

type SceneFlag = Phaser.Scene & { __leaving?: boolean };

/** Fade out current scene, then start target. Safe to call repeatedly. */
export function goScene(
  scene: Phaser.Scene,
  key: string,
  data?: object,
  duration = 180,
): void {
  const s = scene as SceneFlag;
  if (s.__leaving) return;
  s.__leaving = true;

  // Stop gameplay input immediately so double-taps don't stack actions.
  scene.input.enabled = false;

  const cam = scene.cameras.main;
  let jumped = false;
  const jump = () => {
    if (jumped) return;
    jumped = true;
    // Ensure next scene gets a clean camera / input state.
    try {
      cam.resetFX();
    } catch {
      /* ignore */
    }
    scene.scene.start(key, data);
  };

  // If a previous fade left the camera mid-transition, force a clean fade.
  try {
    cam.fadeOut(duration, 8, 6, 14);
  } catch {
    jump();
    return;
  }

  cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, jump);
  // Fallback if FADE_OUT_COMPLETE is skipped (already faded / interrupted).
  scene.time.delayedCall(duration + 80, jump);
}

/** Call at the start of every scene create(). */
export function fadeInScene(scene: Phaser.Scene, duration = 220): void {
  const s = scene as SceneFlag;
  s.__leaving = false;
  scene.input.enabled = true;

  const cam = scene.cameras.main;
  try {
    cam.resetFX();
  } catch {
    /* ignore */
  }
  cam.fadeIn(duration, 8, 6, 14);
}
