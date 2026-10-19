import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repository } from './helpers.mjs';

const helper = join(repository, 'skills/studio-editor/scripts/run-praxity.mjs');

test('file-backed CLI arguments preserve shell syntax, quotes and JSON strings byte for byte', t => {
  const root = mkdtempSync(join(tmpdir(), 'studio-edit-helper-'));
  t.after(() => rmSync(root, { recursive: true }));
  const fake = join(root, 'fake praxity.mjs'), input = join(root, 'args.json');
  const marker = join(root, 'must-not-exist');
  writeFileSync(fake, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));');
  for (const text of [`Costs $(touch "${marker}")`, 'He said "yes"; `echo unsafe`', 'true', '42', '{"text":"true"}', '"true"']) {
    const args = ['edit', '.', 'setText', '--at', 'rendered-id', '--rendered', '--arg', 'field=subject',
      '--arg', `text=${JSON.stringify(text)}`, '--expect-revision', 'revision', '--dry-run', '--json'];
    writeFileSync(input, JSON.stringify(args));
    const result = spawnSync(process.execPath, [helper, input, fake]);
    assert.equal(result.status, 0, result.stderr?.toString());
    assert.deepEqual(result.stdout, Buffer.from(JSON.stringify(args)));
    assert.equal(JSON.parse(JSON.parse(result.stdout)[9].slice('text='.length)), text);
    assert.equal(existsSync(marker), false);
  }
});

test('file-backed CLI refuses malformed input without echoing its contents and preserves CLI refusals', t => {
  const root = mkdtempSync(join(tmpdir(), 'studio-edit-helper-'));
  t.after(() => rmSync(root, { recursive: true }));
  const fake = join(root, 'fake.mjs'), input = join(root, 'args.json');
  writeFileSync(fake, 'process.exitCode = 3;');
  for (const value of ['{PRIVATE-SENTINEL', '{"PRIVATE-SENTINEL":true}', '["edit", 42]']) {
    writeFileSync(input, value);
    const result = spawnSync(process.execPath, [helper, input, fake], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'Cannot run Praxity. Use a readable JSON array of string arguments.\n');
  }
  writeFileSync(input, '["comments", "list", "."]');
  assert.equal(spawnSync(process.execPath, [helper, input, fake]).status, 3);
});
