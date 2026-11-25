// Original quadcopter, air lanes and promotion rays; same local path pipeline as T21.
import { path } from './art-svg.ts';
import type { VectorArt } from './art-svg.ts';
export const MOTION_ART = {
  drone: { viewBox: '0 0 128 128', paths: [
    path('M26 36 102 92M102 36 26 92', 'none', '#376c70', 8),
    path('M9 32a20 10 0 1 0 40 0 20 10 0 1 0-40 0M79 32a20 10 0 1 0 40 0 20 10 0 1 0-40 0', '#d9f5ed'),
    path('M9 96a20 10 0 1 0 40 0 20 10 0 1 0-40 0M79 96a20 10 0 1 0 40 0 20 10 0 1 0-40 0', '#d9f5ed'),
    path('M49 45h30l8 35H41z', '#fff9e9'), path('M56 60h16v12H56z', '#63bfc2'),
    path('M60 84h8v10h-8z', '#e1b856'),
  ] },
  rays: { viewBox: '0 0 128 128', paths: [
    path('M60 52 52 4h24l-8 48M76 56 104 16l16 20-36 28', '#f7dc8e', '#f7dc8e'),
    path('M76 76 122 84l-12 24-40-24M56 80 48 124H24l24-48', '#f7dc8e', '#f7dc8e'),
    path('M48 68 4 84V60l44 0M48 52 12 24l20-16 24 40', '#f7dc8e', '#f7dc8e'),
    path('M64 38 85 52v25L64 94 43 77V52z', '#d9f5ed'),
    path('M52 67 64 55l12 12M64 55v25', 'none', '#376c70', 4),
  ] },
} as const satisfies Record<string, VectorArt>;
