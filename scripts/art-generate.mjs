// Usage: node scripts/art-generate.mjs docs/art-prompts.json <out dir> <name> [<name> ...]
// Runs the Codex CLI's built-in image generation for each name, 4 at a time, each in its own empty dir.
// Output: <out dir>/<name>.png (existing files are kept unless FORCE=1). Prints one line per image: OK / FAIL.
// Only the prompt text leaves the machine. Then: node scripts/art-export.mjs <out dir>. See docs/art-pipeline.md.
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, copyFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const [, , promptsFile, outDir, ...names] = process.argv;
if (!promptsFile || !outDir || !names.length) throw new Error('usage: node scripts/art-generate.mjs <prompts.json> <out dir> <name> ...');
const prompts = JSON.parse(readFileSync(promptsFile, 'utf8'));
const PREFIX = 'Use your built-in image generation tool (not code, not SVG, not Python drawing) to generate one image, then copy it to the given file name in the current directory. Do not post-process it. Reply with the file name only.';
const out = resolve(outDir);
mkdirSync(out, { recursive: true });

function one(name) {
  return new Promise((resolve) => {
    const body = prompts[name];
    if (!body) { process.exitCode = 1; console.log(`FAIL ${name} (no prompt)`); return resolve(); }
    const prompt = (prompts._style?.[name.split('-')[0]] ?? '') + body + (prompts._tail?.[name.split('-')[0]] ?? '');
    const dir = join(tmpdir(), 'art-generate', `${name}-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const child = spawn('timeout', ['420', 'codex', 'exec', '-m', 'gpt-6.2-astra', '-c', 'model_reasoning_effort=low',
      '--sandbox', 'workspace-write', '--skip-git-repo-check', '-C', dir,
      `${PREFIX} File name: ./${name}.png. Image: ${prompt}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', (d) => { log += d; });
    child.stderr.on('data', (d) => { log += d; });
    child.on('close', (code) => {
      const png = readdirSync(dir).find((f) => f.endsWith('.png'));
      if (png) { copyFileSync(join(dir, png), join(out, `${name}.png`)); console.log(`OK ${name}`); }
      else { process.exitCode = 1; console.log(`FAIL ${name} exit=${code} ${log.slice(-400).replace(/\s+/g, ' ')}`); }
      resolve();
    });
  });
}

const queue = names.filter((n) => process.env.FORCE || !existsSync(join(out, `${n}.png`)));
const workers = Array.from({ length: 4 }, async () => { while (queue.length) await one(queue.shift()); });
await Promise.all(workers);
