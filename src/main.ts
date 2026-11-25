import './styles.css';
import { mountLife } from './ui2/app.ts';

const root = document.querySelector<HTMLDivElement>('#app')!;
const params = new URLSearchParams(location.search);
function seed(): number | undefined {
  const value = params.get('seed');
  if (value !== null && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))) return Number(value);
  return undefined;
}

// The life board is the only client. Existing ?life=1 links remain valid.
mountLife(root, seed(), params.get('debug') === '1');
