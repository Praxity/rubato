import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { courseActions } from '../src/init.mjs';
import { pathToFileURL } from 'node:url';
import { fixture, realPack, fakeTool } from './helpers.mjs';

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
  fakeTool(context, 'studio', body);
  writeFileSync(join(bin, 'record.mjs'), `import { runCli } from ${JSON.stringify(pathToFileURL(join(import.meta.dirname, '../src/cli.mjs')).href)};
const context = ${JSON.stringify(context)};
context.env = process.env;
process.exitCode = await runCli(process.argv.slice(2), context);
`);
  writeFileSync(join(bin, 'praxity'), `#!/bin/sh\nexec ${quote(process.execPath.replaceAll('\\', '/'))} ${quote(join(bin, 'record.mjs').replaceAll('\\', '/'))} "$@"\n`, { mode: 0o755 });
}

function execute(action, context, env = {}) {
  const result = spawnSync(shell, ['-c', action.command], { cwd: context.cwd, encoding: 'utf8', env: { ...process.env, HOME: context.home.replaceAll('\\', '/'), ...env } });
  assert.ifError(result.error);
  return result;
}

for (const [index, action] of actions.entries()) {
  for (const [state, code, targetCode = 0] of [['success', 0], ['failure', 2], ['pending', 1], ['rederive', 1], ['target failure', 0, 7], ['interrupted', 130]]) {
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
process.exit(Number(process.env.TARGET_CODE));
`);
      const result = execute(action, context, { CALL_LOG: log, INIT_STATE: state, INIT_CODE: String(code), TARGET_CODE: String(targetCode) });
      const calls = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
      assert.deepEqual(calls.map(call => call.args), code === 0 ? [['identity', 'init', '.'], targets[index]] : [['identity', 'init', '.']]);
      assert.ok(calls.every(call => call.cwd === context.cwd));
      assert.equal(result.status, code || targetCode);
      assert.match(result.stdout, new RegExp('Studio JSON report: ' + state));
      assert.match(result.stderr, new RegExp('Studio readable report: ' + state));
      if (code !== 0 && code < 128) assert.match(result.stderr, /Ask your agent how to proceed\./);
      if (code >= 128) assert.doesNotMatch(result.stderr, /Ask your agent how to proceed\./);
    });
  }
}

test('failed init leaves the interactive action shell alive with its report', t => {
  const { context } = fixture(t);
  const log = join(context.home, 'interactive-calls.jsonl');
  launcher(context, `import { appendFileSync } from 'node:fs';
appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n');
console.log('Studio failure report'); process.exit(1);`);
  const result = spawnSync(shell, ['--noprofile', '--norc', '-i'], {
    cwd: context.cwd, encoding: 'utf8', timeout: 10000,
    env: { ...process.env, HOME: context.home.replaceAll('\\', '/'), BASH_ENV: undefined },
    input: ` ${actions[0].command}\nprintf 'SHELL-STILL-ALIVE\\n'\nexit\n`,
  });
  assert.ifError(result.error);
  assert.match(result.stdout, /Studio failure report/);
  assert.match(result.stderr, /Ask your agent how to proceed\./);
  assert.match(result.stdout, /SHELL-STILL-ALIVE/);
  assert.deepEqual(readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse), [['identity', 'init', '.']]);
});

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
