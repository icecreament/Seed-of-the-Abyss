/// <reference types="vite/client" />

/** Bridge exposed by electron/preload.cjs (desktop shell only). */
interface SeedDesktopApi {
  isElectron: true;
  setFullscreen(flag: boolean): Promise<void>;
  isFullscreen(): Promise<boolean>;
  setWindowSize(w: number, h: number): Promise<void>;
  /** Returns an unsubscribe function. */
  onFullscreenChanged(cb: (flag: boolean) => void): () => void;
  /** Returns an unsubscribe function. */
  onWindowSizeChanged(cb: (w: number, h: number) => void): () => void;
}

interface Window {
  seedDesktop?: SeedDesktopApi;
}
