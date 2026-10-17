import Phaser from 'phaser';
import { syncSceneRenderScale } from '../game/config';

type SceneFlag = Phaser.Scene & { __leaving?: boolean };

/** Fade out current scene, then start target. Safe to call repeatedly. */
export function goScene(
  scene: Phaser.Scene,
  key: string,
  data?: object,
  duration = 160,
): void {
  const s = scene as SceneFlag;
  if (s.__leaving) return;
  s.__leaving = true;

  // Soft-disable only this scene's input; next scene will re-enable.
  scene.input.enabled = false;

  const cam = scene.cameras.main;
  let jumped = false;
  const jump = () => {
    if (jumped) return;
    jumped = true;
    try {
      cam.resetFX();
    } catch {
      /* ignore */
    }
    // Always re-enable before leaving so a stuck scene doesn't poison global input.
    scene.input.enabled = true;
    s.__leaving = false;
    scene.scene.start(key, data);
  };

  try {
    cam.fadeOut(duration, 8, 6, 14);
  } catch {
    jump();
    return;
  }

  cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, jump);
  scene.time.delayedCall(duration + 100, jump);
}

/** Call at the start of every scene create(). */
export function fadeInScene(scene: Phaser.Scene, duration = 200): void {
  syncSceneRenderScale(scene);
  const s = scene as SceneFlag;
  s.__leaving = false;
  scene.input.enabled = true;
  scene.input.setTopOnly(true);

  // Clear any stale pointer capture from previous scene.
  try {
    scene.input.resetPointers();
  } catch {
    /* ignore */
  }

  const cam = scene.cameras.main;
  try {
    cam.resetFX();
  } catch {
    /* ignore */
  }
  cam.fadeIn(duration, 8, 6, 14);
}
