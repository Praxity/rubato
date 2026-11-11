import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { courseActions } from '../src/t3-actions.mjs';
import { fixture, realPack } from './helpers.mjs';

const shell = process.env.PRAXITY_TEST_SHELL ?? (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash');
const quote = value => `'${value.replaceAll("'", "'\"'\"'")}'`;
const actions = courseActions(41873).slice(0, 3);
const targets = [
  ['studio', '.', '--port', '41873', '--no-open'],
  ['export', '.', '--format', 'html', '--output', 'course-html.zip'],
  ['export', '.', '--format', 'pdf', '--output', 'course.pdf'],
];

function launcher(context, body) {
  const bin = join(context.home, '.praxity/bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'record.mjs'), body);
  writeFileSync(join(bin, 'praxity'), `#!/bin/sh\nexec ${quote(process.execPath.replaceAll('\\', '/'))} ${quote(join(bin, 'record.mjs').replaceAll('\\', '/'))} "$@"\n`, { mode: 0o755 });
}

function execute(action, context, env = {}) {
  const result = spawnSync(shell, ['-c', action.command], { cwd: context.cwd, encoding: 'utf8', env: { ...process.env, HOME: context.home.replaceAll('\\', '/'), ...env } });
  assert.ifError(result.error);
  return result;
}

for (const [index, action] of actions.entries()) {
  for (const [state, code] of [['success', 0], ['failure', 2], ['pending', 1], ['rederive', 1]]) {
    test(`${action.name}: ${state} identity initialization gates the target process`, t => {
      const { context } = fixture(t);
      const log = join(context.home, 'calls.jsonl');
      launcher(context, `import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.CALL_LOG, JSON.stringify({ args, cwd: process.cwd() }) + '\\n');
if (args[0] === 'identity') {
  console.log('Studio JSON report: ' + process.env.INIT_STATE);
  console.error('Studio readable report: ' + process.env.INIT_STATE);
  process.exit(Number(process.env.INIT_CODE));
}
`);
      const result = execute(action, context, { CALL_LOG: log, INIT_STATE: state, INIT_CODE: String(code) });
      const calls = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
      assert.deepEqual(calls.map(call => call.args), code === 0 ? [['identity', 'init', '.'], targets[index]] : [['identity', 'init', '.']]);
      assert.ok(calls.every(call => call.cwd === context.cwd));
      assert.equal(result.status === 0, code === 0);
      assert.match(result.stdout, new RegExp('Studio JSON report: ' + state));
      assert.match(result.stderr, new RegExp('Studio readable report: ' + state));
      if (code !== 0) assert.match(result.stderr, /Ask your agent how to proceed\./);
    });
  }
}

const studio = process.env.PRAXITY_TEST_STUDIO_CLI;
test('pinned Studio CLI refuses pending identity and required rederivation', { skip: !studio && 'Set PRAXITY_TEST_STUDIO_CLI to the packaged pinned Studio CLI.' }, t => {
  const inventory = JSON.parse(readFileSync(join(dirname(studio), 'inventory.json'), 'utf8'));
  assert.equal(inventory.sourceRevision, realPack().tools.find(tool => tool.id === 'studio').sourceRevision);
  assert.equal(inventory.sourceTreeDirty, false);
  const { context } = fixture(t);
  writeFileSync(join(context.cwd, 'course.yaml'), 'title: Synthetic course\nlocale: en\nlessons:\n  - lesson.prax\n');
  const lesson = join(context.cwd, 'lesson.prax');
  const original = '# Lesson\n\n## Page\n\nOriginal paragraph.\n';
  writeFileSync(lesson, original);
  const init = () => spawnSync(process.execPath, [studio, 'identity', 'init', context.cwd], { encoding: 'utf8' });
  let result = init();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).ok, true);
  writeFileSync(lesson, original + '\nOriginal paragraph.\n');
  result = init();
  assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(result.stdout).error.code, 'identity_init_failed');
  assert.match(result.stderr, /repeats a block/);
  writeFileSync(lesson, original.replace('Original paragraph.', 'Replacement paragraph.'));
  result = init();
  assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(result.stdout).error.code, 'identity_init_failed');
  assert.match(result.stderr, /--rederive/);
});
