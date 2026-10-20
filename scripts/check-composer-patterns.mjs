import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const START = '<!-- library-pattern-guidance:start -->';
const END = '<!-- library-pattern-guidance:end -->';
const root = fileURLToPath(new URL('../', import.meta.url));
const pinnedLibrary = join(root, 'docs/provenance/learning-patterns');

function sections(text, name) {
  const found = new Map();
  let current;
  let fence;
  for (const line of text.replaceAll('\r\n', '\n').split('\n')) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined;
      continue;
    }
    if (fence) continue;
    const heading = /^(#{1,2}) (.+?)\s*$/.exec(line);
    if (heading) {
      current = heading[1] === '##' && ['Use it when', 'Avoid it when'].includes(heading[2])
        ? heading[2] : undefined;
      if (current) {
        if (found.has(current)) throw new Error(`${name}: duplicate ${current}`);
        found.set(current, []);
      }
    } else if (current) found.get(current).push(line);
  }
  return ['Use it when', 'Avoid it when'].map(heading => {
    const content = found.get(heading)?.join(' ').replace(/\s+/g, ' ').trim();
    if (!content) throw new Error(`${name}: missing or empty ${heading}`);
    return content.replaceAll('|', '\\|');
  });
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.at(-1) === '--write';
  if (write) args.pop();
  if ((args.length !== 0 && args.length !== 2) || args.some(arg => arg.startsWith('--'))) {
    throw new Error('Usage: node check-composer-patterns.mjs [<library-root> <patterns.md>] [--write]');
  }
  const [library = pinnedLibrary, target = join(root, 'skills/composer/patterns.md')] = args;
  const rows = [];
  const entries = await readdir(join(library, 'patterns'), { withFileTypes: true });
  const patterns = entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  if (resolve(library) === resolve(pinnedLibrary)) {
    const pin = JSON.parse(await readFile(join(root, 'docs/provenance/learning-patterns.json'), 'utf8'));
    if (!/^[a-f0-9]{40}$/.test(pin.sourceRevision) || pin.source !== `https://github.com/Praxity/learning-patterns/tree/${pin.sourceRevision}`) {
      throw new Error('Invalid learning-patterns source revision');
    }
    const expected = ['LICENSE', ...patterns.map(name => `patterns/${name}/README.md`)];
    if (JSON.stringify(Object.keys(pin.files).sort()) !== JSON.stringify(expected.sort())) {
      throw new Error('Pinned file inventory does not match the library READMEs');
    }
    for (const file of expected) {
      const bytes = await readFile(join(library, file));
      if (createHash('sha256').update(bytes).digest('hex') !== pin.files[file]) {
        throw new Error(`Pinned SHA-256 mismatch: ${file}`);
      }
    }
  }
  for (const name of patterns) {
    const readme = await readFile(join(library, 'patterns', name, 'README.md'), 'utf8');
    const [use, avoid] = sections(readme, `${name}/README.md`);
    rows.push(`| \`${name}\` | ${use} | ${avoid} |`);
  }
  if (!rows.length) throw new Error('No library patterns found');
  const table = ['| Pattern | Use it when | Avoid it when |', '| --- | --- | --- |', ...rows].join('\n');
  const original = await readFile(target, 'utf8');
  const text = original.replaceAll('\r\n', '\n');
  if (text.split(START).length !== 2 || text.split(END).length !== 2 || text.indexOf(END) < text.indexOf(START)) {
    throw new Error('patterns.md needs exactly one ordered pair of library-pattern-guidance markers');
  }
  const start = text.indexOf(START) + START.length;
  const end = text.indexOf(END);
  const expected = `\n\n${table}\n\n`;
  if (text.slice(start, end) !== expected) {
    if (!write) throw new Error('Library guidance is stale. Run the same command with --write and review the diff.');
    const updated = text.slice(0, start) + expected + text.slice(end);
    await writeFile(target, original.includes('\r\n') ? updated.replaceAll('\n', '\r\n') : updated);
  }
  console.log(`Library guidance matches ${rows.length} pattern READMEs.`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
