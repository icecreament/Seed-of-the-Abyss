import Phaser from 'phaser';
import { gameConfig, isElectronShell, isTouchLikeDevice } from './game/config';

const game = new Phaser.Game(gameConfig);

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
};
window.addEventListener('resize', refreshScale);
window.addEventListener('orientationchange', () => {
  window.setTimeout(refreshScale, 120);
});
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
