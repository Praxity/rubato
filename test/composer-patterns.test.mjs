import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('../scripts/check-composer-patterns.mjs', import.meta.url));
const readme = '# Example\n\n## Use it when\n\nRecall a few ideas.\n\n## Avoid it when\n\nYou need a grade.\n\n## How it works\n\nOther text.\n';
const before = '# Patterns\n\n## Studio compositions\n\nKeep this hand-written guidance.\n\n';
const after = '\n\n## Studio support\n\nKeep these statuses and fallbacks.\n';
const block = '<!-- library-pattern-guidance:start -->\n\n| Pattern | Use it when | Avoid it when |\n| --- | --- | --- |\n| `example` | Recall a few ideas. | You need a grade. |\n\n<!-- library-pattern-guidance:end -->';

async function fixture(t, source = readme, composer = before + block + after) {
  const root = await mkdtemp(join(tmpdir(), 'composer-staleness-'));
  t.after(() => rm(root, { recursive: true }));
  const folder = join(root, 'patterns', 'example');
  await mkdir(folder, { recursive: true });
  const sourcePath = join(folder, 'README.md');
  const target = join(root, 'patterns.md');
  await writeFile(sourcePath, source);
  await writeFile(target, composer);
  return { root, sourcePath, target, run: (...args) => spawnSync(process.execPath, [script, root, target, ...args], { encoding: 'utf8', timeout: 10_000 }) };
}

test('compares both sections, ignores unrelated sections and accepts CRLF', async t => {
  const f = await fixture(t, readme.replaceAll('\n', '\r\n'), (before + block + after).replaceAll('\n', '\r\n'));
  assert.equal(f.run().status, 0);
});

for (const sentence of ['Recall a few ideas.', 'You need a grade.']) {
  test(`fails when source changes: ${sentence}`, async t => {
    const f = await fixture(t, readme.replace(sentence, 'Changed guidance.'));
    const result = f.run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /guidance is stale/);
  });
  test(`fails when composer changes: ${sentence}`, async t => {
    const f = await fixture(t, readme, (before + block + after).replace(sentence, 'Changed guidance.'));
    assert.equal(f.run().status, 1);
  });
}

test('write refreshes only the generated region, preserves CRLF and then passes', async t => {
  const f = await fixture(t, readme.replace('Recall a few ideas.', 'Choose `one | two`.\n\nKeep it short.'), (before + block + after).replaceAll('\n', '\r\n'));
  assert.equal(f.run().status, 1);
  assert.equal(f.run('--write').status, 0);
  assert.equal(await readFile(f.target, 'utf8'), (before + block.replace('Recall a few ideas.', 'Choose `one \\| two`. Keep it short.') + after).replaceAll('\n', '\r\n'));
  assert.equal(f.run().status, 0);
});

for (const heading of ['Use it when', 'Avoid it when']) {
  test(`refuses missing or duplicate ${heading}`, async t => {
    for (const source of [readme.replace(`## ${heading}`, '## Other'), readme + `\n## ${heading}\nDuplicate.\n`]) {
      const f = await fixture(t, source);
      const result = f.run('--write');
      assert.equal(result.status, 1);
      assert.match(result.stderr, /missing|duplicate/);
    }
  });
}

test('copies an empty avoid section without inventing guidance and excludes setup notes', async t => {
  const source = readme.replace('You need a grade.', '').replace('## How it works', '## Setting it up\n\nConfigure the host.\n\n## How it works');
  const f = await fixture(t, source);
  assert.match(f.run().stderr, /guidance is stale/);
  assert.equal(f.run('--write').status, 0);
  assert.equal(f.run().status, 0);
  assert.equal(await readFile(f.target, 'utf8'), before + block.replace('You need a grade.', '') + after);
});

test('still rejects an empty use section', async t => {
  const f = await fixture(t, readme.replace('Recall a few ideas.', ''));
  assert.match(f.run('--write').stderr, /empty Use it when/);
});

test('fails on added and removed patterns and rejects a missing README', async t => {
  const f = await fixture(t);
  const added = join(f.root, 'patterns', 'second');
  await mkdir(added);
  assert.equal(f.run().status, 1);
  await writeFile(join(added, 'README.md'), readme);
  assert.equal(f.run().status, 1);
  assert.equal(f.run('--write').status, 0);
  await rm(added, { recursive: true });
  assert.equal(f.run().status, 1);
  await rm(join(f.root, 'patterns', 'example'), { recursive: true });
  assert.match(f.run('--write').stderr, /No library patterns/);
});

test('refuses absent, duplicate or reversed markers without modifying the file', async t => {
  for (const composer of [before, block + block, '<!-- library-pattern-guidance:end -->\n<!-- library-pattern-guidance:start -->']) {
    const f = await fixture(t, readme, composer);
    assert.equal(f.run('--write').status, 1);
    assert.equal(await readFile(f.target, 'utf8'), composer);
  }
});

test('ignores headings in fenced examples and normalizes source wrapping', async t => {
  const f = await fixture(t, readme.replace('Recall a few ideas.', 'Recall a few\nideas.\n\n~~~md\n## Avoid it when\nFake guidance.\n~~~'));
  assert.equal(f.run().status, 0);
});

test('fails with a readable error for missing files and invalid arguments', async t => {
  const f = await fixture(t);
  assert.match(f.run('--unknown').stderr, /Usage:/);
  await rm(f.target);
  assert.match(f.run().stderr, /ENOENT/);
});

test('checked-in composer guidance matches the pinned library without a live clone', () => {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /matches 14 pattern READMEs/);
});

async function pinnedFixture(t) {
  const f = await fixture(t);
  const localScript = join(f.root, 'scripts/check-composer-patterns.mjs');
  const library = join(f.root, 'docs/provenance/learning-patterns');
  const sourcePath = join(library, 'patterns/example/README.md');
  const target = join(f.root, 'skills/composer/patterns.md');
  await mkdir(join(f.root, 'scripts'));
  await mkdir(join(library, 'patterns/example'), { recursive: true });
  await mkdir(join(f.root, 'skills/composer'), { recursive: true });
  await copyFile(script, localScript);
  await writeFile(sourcePath, readme);
  await writeFile(join(library, 'LICENSE'), 'MIT fixture\n');
  await writeFile(target, before + block + after);
  const revision = '0123456789012345678901234567890123456789';
  const pin = {
    source: `https://github.com/Praxity/learning-patterns/tree/${revision}`,
    sourceRevision: revision,
    files: {
      LICENSE: createHash('sha256').update('MIT fixture\n').digest('hex'),
      'patterns/example/README.md': createHash('sha256').update(readme).digest('hex'),
    },
  };
  const pinPath = join(f.root, 'docs/provenance/learning-patterns.json');
  await writeFile(pinPath, JSON.stringify(pin));
  return { library, sourcePath, target, pinPath, pin, run: (...args) => spawnSync(process.execPath, [localScript, ...args], { cwd: tmpdir(), encoding: 'utf8', timeout: 10_000 }) };
}

test('default CLI resolves the pinned sources from the script and rejects tampering before writing', async t => {
  const f = await pinnedFixture(t);
  assert.equal(f.run().status, 0);
  const original = await readFile(f.target, 'utf8');
  await writeFile(f.sourcePath, readme.replace('You need a grade.', 'Changed guidance.'));
  assert.equal(f.run().status, 1);
  assert.match(f.run('--write').stderr, /Pinned SHA-256 mismatch: patterns\/example\/README.md/);
  assert.equal(await readFile(f.target, 'utf8'), original);
});

test('a deliberate pin update still fails until the composer guidance is regenerated', async t => {
  const f = await pinnedFixture(t);
  const changed = readme.replace('You need a grade.', 'You need an assessed result.');
  await writeFile(f.sourcePath, changed);
  f.pin.files['patterns/example/README.md'] = createHash('sha256').update(changed).digest('hex');
  await writeFile(f.pinPath, JSON.stringify(f.pin));
  assert.match(f.run().stderr, /guidance is stale/);
  assert.equal(f.run('--write').status, 0);
  assert.equal(f.run().status, 0);
  assert.match(await readFile(f.target, 'utf8'), /You need an assessed result\./);
});

test('default CLI rejects an invalid revision, a missing pin, or an incomplete file inventory', async t => {
  const f = await pinnedFixture(t);
  await writeFile(f.pinPath, JSON.stringify({ ...f.pin, sourceRevision: 'main' }));
  assert.match(f.run().stderr, /Invalid learning-patterns source revision/);
  await writeFile(f.pinPath, JSON.stringify({ ...f.pin, files: {} }));
  assert.match(f.run().stderr, /Pinned file inventory/);
  await rm(f.pinPath);
  assert.match(f.run().stderr, /ENOENT/);
});
