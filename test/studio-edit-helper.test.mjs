import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repository } from './helpers.mjs';

const helper = join(repository, 'skills/studio-editor/scripts/run-praxity.mjs');

test('prescribed helper invocation uses the active installed runtime with no Node on PATH', t => {
  const root = mkdtempSync(join(tmpdir(), 'studio runtime with spaces '));
  t.after(() => rmSync(root, { recursive: true }));
  const toolkit = join(root, '.praxity/toolkit'), pack = join(toolkit, '0.1.1');
  const platform = `${process.platform}-${process.arch}`, entry = process.platform === 'win32' ? 'node.exe' : 'bin/node';
  const installed = join(pack, 'runtimes/node', entry);
  mkdirSync(join(installed, '..'), { recursive: true });
  copyFileSync(process.execPath, installed);
  writeFileSync(join(toolkit, 'active'), '0.1.1\n');
  writeFileSync(join(pack, 'state.json'), JSON.stringify({ owner: 'praxity-toolkit', platform }));
  writeFileSync(join(pack, 'pack.json'), JSON.stringify({ runtimes: { node: { entry: { [platform]: entry } } } }));
  const document = readFileSync(join(repository, 'skills/studio-editor/SKILL.md'), 'utf8');
  const step = document.split('3. Apply only')[1].split('\n4. ')[0];
  for (const field of ['~/.praxity/toolkit/active', 'state.json', 'pack.json', 'runtimes.node.entry[platform]']) assert.ok(step.includes(field), field);
  assert.match(step.replace(/\s+/g, ' '), /Quote the runtime, helper and args-file paths/);
  const invocation = step.match(/"<installed-node>" "<skill-directory>\/scripts\/run-praxity.mjs" "<dry-run-args-file>"/)?.[0];
  assert.ok(invocation, 'invocation quotes all paths and does not require global Node');
  // Follow the documented file-tool lookup, then execute that exact command template.
  const active = readFileSync(join(toolkit, 'active'), 'utf8').split('\n')[0];
  const activePack = join(toolkit, active);
  const state = JSON.parse(readFileSync(join(activePack, 'state.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(join(activePack, 'pack.json'), 'utf8'));
  const runtime = join(activePack, 'runtimes/node', manifest.runtimes.node.entry[state.platform]);
  const skillDirectory = join(root, 'installed skill');
  mkdirSync(join(skillDirectory, 'scripts'), { recursive: true });
  copyFileSync(helper, join(skillDirectory, 'scripts/run-praxity.mjs'));
  const input = join(root, 'dry run args.json'), fake = join(root, 'fixture CLI.mjs');
  writeFileSync(input, '["edit", "a course", "setText"]');
  writeFileSync(fake, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));');
  const env = { ...process.env, PATH: join(root, 'no executables') };
  assert.equal(spawnSync('node', ['--version'], { env, cwd: root }).error?.code, 'ENOENT');
  const command = invocation.replace('<installed-node>', runtime).replace('<skill-directory>', skillDirectory).replace('<dry-run-args-file>', input) + ` "${fake}"`;
  const windows = process.platform === 'win32';
  const shell = windows ? join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe') : '/bin/sh';
  const result = spawnSync(shell, windows ? ['-NoProfile', '-NonInteractive', '-Command', `& ${command}`] : ['-c', command], { env, cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '["edit","a course","setText"]');
});

test('helper reports launcher and argument error codes without argument text', t => {
  const root = mkdtempSync(join(tmpdir(), 'studio-edit-errors-'));
  t.after(() => rmSync(root, { recursive: true }));
  const input = join(root, 'args.json'), missing = join(root, 'missing launcher');
  writeFileSync(input, '["PRIVATE-SENTINEL"]');
  const absent = spawnSync(process.execPath, [helper, input, missing], { encoding: 'utf8' });
  assert.equal(absent.status, 1);
  assert.match(absent.stderr, /launcher not found.*ENOENT/);
  assert.doesNotMatch(absent.stderr, /PRIVATE-SENTINEL/);
  writeFileSync(input, JSON.stringify(['PRIVATE-SENTINEL\0']));
  const invalid = spawnSync(process.execPath, [helper, input, process.execPath], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /ERR_INVALID_ARG_VALUE/);
  assert.doesNotMatch(invalid.stderr, /PRIVATE-SENTINEL/);
});

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
