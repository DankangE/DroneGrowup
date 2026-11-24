/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** '1' turns on nalidagame.online login, server save and leaderboard (src/platform.ts). */
  readonly VITE_NG_PLATFORM?: string;
  /** NalidaGame API base, default https://api.nalidagame.online. */
  readonly VITE_NG_API?: string;
  /** Portal (login / nickname pages), default https://nalidagame.online. */
  readonly VITE_NG_PORTAL?: string;
}
