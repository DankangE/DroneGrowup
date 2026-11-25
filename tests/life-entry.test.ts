import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';

// Exercise the real entry module without CSS loading, a browser or a listening port.
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const { outputText } = transpileModule(source, {
  compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
});

for (const [query, seed, debug] of [
  ['', undefined, false],
  ['?seed=11', 11, false],
  ['?life=1&seed=11', 11, false],
  ['?life=0&seed=7&debug=1', 7, true],
  ['?life=1&seed=0&debug=1', 0, true],
  ['?seed=-1', undefined, false],
  ['?seed=1.5', undefined, false],
  ['?seed=9007199254740992', undefined, false],
] as const) {
  test(`entry ${query || '/'} boots only the life board with the requested seed/debug mode`, () => {
    const root = {}, calls: unknown[][] = [];
    runInNewContext(outputText, {
      exports: {}, URLSearchParams, Uint32Array,
      location: { search: query },
      document: { querySelector: (selector: string) => {
        assert.equal(selector, '#app'); return root;
      } },
      crypto: { getRandomValues: (values: Uint32Array) => { values[0] = 42; return values; } },
      require: (id: string) => {
        if (id === './styles.css') return {};
        assert.equal(id, './ui2/app.ts', 'entry has no classic engine or UI dependency');
        return { mountLife: (...args: unknown[]) => calls.push(args) };
      },
    });
    assert.deepEqual(calls, [[root, seed, debug]]);
  });
}
