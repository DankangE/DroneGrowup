import './styles.css';
import { mountLife } from './ui2/app.ts';

// vite.config.ts sets this: false in release builds, so ?seed and ?debug=1 are compiled out. Source run
// without Vite (unit tests) has no define and keeps them.
declare const __LIFE_DEV_HOOKS__: boolean | undefined;
const devHooks = typeof __LIFE_DEV_HOOKS__ === 'undefined' || __LIFE_DEV_HOOKS__;

const root = document.querySelector<HTMLDivElement>('#app')!;
function seed(params: URLSearchParams): number | undefined {
  const value = params.get('seed');
  if (value !== null && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))) return Number(value);
  return undefined;
}

// The life board is the only client. Existing ?life=1 links remain valid.
if (devHooks) {
  const params = new URLSearchParams(location.search);
  mountLife(root, seed(params), params.get('debug') === '1');
} else mountLife(root);
