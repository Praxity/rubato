import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCli } from '../src/cli.mjs';
import { fixture } from './helpers.mjs';
import { posix, shell } from './installer-fixture.mjs';

test('all five T3 actions execute the installed launcher without it on PATH', async t => {
  const { context } = fixture(t);
  writeFileSync(join(context.cwd, 'course.yaml'), 'course fixture\n');
  mkdirSync(join(context.home, '.praxity/bin'), { recursive: true });
  // The launcher is the shell boundary; capture exactly what each action passes.
  writeFileSync(join(context.home, '.praxity/bin/praxity'), '#!/bin/sh\nprintf \'%s\\n\' "$@"\nprintf \'\\n\'\n', { mode: 0o755 });
  const env = { ...process.env, HOME: posix(context.home), BASH_ENV: undefined };
  const run = command => shell(`PATH=/usr/bin:/bin; export PATH; ${command}`, { env });
  assert.notEqual(run('command -v praxity').status, 0);
  await runCli(['init'], context, { print: () => {} });
  const { scripts } = JSON.parse(readFileSync(join(context.cwd, 't3.json'), 'utf8'));
  const port = new URL(scripts[0].previewUrl).port;
  const expected = [
    [['identity', 'init', '.'], ['studio', '.', '--port', port, '--no-open']],
    [['identity', 'init', '.'], ['export', '.', '--format', 'html', '--output', 'course-html.zip']],
    [['identity', 'init', '.'], ['export', '.', '--format', 'pdf', '--output', 'course.pdf']],
    [['check', 'check', 'course-html.zip', '--checks', 'accessibility']],
    [['doctor']],
  ];
  assert.equal(scripts.length, 5);
  for (const [index, script] of scripts.entries()) {
    const result = run(script.command);
    assert.equal(result.status, 0, `${script.name}: ${result.stderr}`);
    assert.deepEqual(result.stdout.trim().split('\n\n').map(call => call.split('\n')), expected[index], script.name);
  }
});
