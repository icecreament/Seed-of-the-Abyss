import Phaser from 'phaser';
import {
  applyRenderScale,
  gameConfig,
  isElectronShell,
  isPortraitBlocked,
  isTouchLikeDevice,
} from './game/config';
import { saveSystem } from './systems/SaveSystem';
import { t } from './i18n/i18n';
import type { RunScene } from './scenes/RunScene';

const game = new Phaser.Game(gameConfig);

// Dev-only handle for E2E checks and console debugging (stripped from prod).
if (import.meta.env.DEV) {
  (window as unknown as { __seedGame: Phaser.Game }).__seedGame = game;
  (window as unknown as { __seedDev: unknown }).__seedDev = {
    applyRenderScale: (s: number) => applyRenderScale(game, s),
    saveSystem,
    syncPortraitOverlay,
  };
}

game.events.once(Phaser.Core.Events.READY, () => {
  // Restore persisted video settings before the first frame.
  applyRenderScale(game, saveSystem.video.renderScale);

  const desktop = window.seedDesktop;
  if (desktop) {
    const v = saveSystem.video;
    void desktop.setWindowSize(v.winW, v.winH);
    if (v.fullscreen) void desktop.setFullscreen(true);
    // Persist every change, wherever it came from (settings UI / F11 / drag).
    desktop.onFullscreenChanged((flag) => saveSystem.setFullscreen(flag));
    desktop.onWindowSizeChanged((w, h) => saveSystem.setWindowSize(w, h));
  }
  syncPortraitOverlay();
});

const rotateOverlay = document.getElementById('rotate-overlay');
const rotateTitle = rotateOverlay?.querySelector<HTMLElement>('.rotate-title') ?? null;
const rotateHint = rotateOverlay?.querySelector<HTMLElement>('.rotate-hint') ?? null;

/** Show/hide the portrait rotate overlay and auto-pause an active run. */
function syncPortraitOverlay(): void {
  const blocked = isPortraitBlocked();
  if (rotateOverlay) {
    rotateOverlay.classList.toggle('visible', blocked);
    if (blocked) {
      if (rotateTitle) rotateTitle.textContent = t('rotate_title');
      if (rotateHint) rotateHint.textContent = t('rotate_hint');
    }
  }
  try {
    const run = game.scene.getScene('Run') as RunScene;
    if (run && run.sys.isActive()) {
      if (blocked) run.pauseForPortrait();
      else run.resumeFromPortrait();
    }
  } catch {
    /* scene manager not booted yet */
  }
}

function blockGesture(e: Event): void {
  e.preventDefault();
}

if (isTouchLikeDevice()) {
  window.addEventListener('touchmove', blockGesture, { passive: false });
  window.addEventListener('gesturestart', blockGesture as EventListener, { passive: false });
  document.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
}

const refreshScale = () => {
  try {
    game.scale.refresh();
  } catch {
    /* ignore during boot */
  }
  syncPortraitOverlay();
};
window.addEventListener('resize', refreshScale);
window.addEventListener('orientationchange', () => {
  window.setTimeout(refreshScale, 120);
});
window.addEventListener('seed:lang-changed', syncPortraitOverlay);
const vv = window.visualViewport;
if (vv) {
  vv.addEventListener('resize', refreshScale);
  vv.addEventListener('scroll', refreshScale);
}

async function tryBrowserFullscreen(): Promise<void> {
  if (isElectronShell()) return;
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => void;
  };
  try {
    if (document.fullscreenElement) return;
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } catch {
    /* blocked */
  }
  refreshScale();
}

// Optional mobile fullscreen on first tap (does not affect hit testing).
if (isTouchLikeDevice() && !isElectronShell()) {
  const onceOpts: AddEventListenerOptions = { once: true, passive: true };
  const arm = () => {
    void tryBrowserFullscreen();
  };
  window.addEventListener('pointerdown', arm, onceOpts);
  window.addEventListener('touchend', arm, onceOpts);
}

if (!isElectronShell()) {
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'F11') return;
    e.preventDefault();
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void tryBrowserFullscreen();
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshScale();
});

document.documentElement.classList.toggle('is-touch', isTouchLikeDevice());
document.documentElement.classList.toggle('is-electron', isElectronShell());

export default game;
