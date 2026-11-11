import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installation, shell, posix, quote } from './installer-fixture.mjs';
import { repository } from './helpers.mjs';

for (const [name, os, cpu, translated, expected] of [
  ['Intel', 'Darwin', 'x86_64', '0', 'darwin-x64'],
  ['Apple Silicon', 'Darwin', 'arm64', '0', 'darwin-arm64'],
  ['Rosetta', 'Darwin', 'x86_64', '1', 'darwin-arm64'],
  ['unsupported', 'Linux', 'x86_64', '0', null],
]) test(`bootstrap selects the native platform on ${name}`, t => {
  const setup = installation(t);
  setup.pack.platforms.push('darwin-x64');
  for (const artifact of [...Object.values(setup.pack.runtimes), ...setup.pack.tools]) {
    artifact.archives['darwin-x64'] = structuredClone(artifact.archives['darwin-arm64']);
    // A wrong platform must fail rather than silently share the fixture archive.
    if (expected) artifact.archives[expected === 'darwin-x64' ? 'darwin-arm64' : 'darwin-x64'] =
      artifact.archives['darwin-x64'].status === 'published'
        ? { ...artifact.archives['darwin-x64'], url: 'file:///missing-wrong-platform.tar.gz' }
        : artifact.archives['darwin-x64'];
  }
  setup.save();
  const mock = join(setup.root, 'platform-bin'); mkdirSync(mock);
  writeFileSync(join(mock, 'uname'), `#!/bin/sh\ncase "$1" in -s) echo ${os};; -m) echo ${cpu};; *) exit 99;; esac\n`, { mode: 0o755 });
  writeFileSync(join(mock, 'sysctl'), `#!/bin/sh\n[ "$*" = '-in sysctl.proc_translated' ] || exit 99\necho ${translated}\n`, { mode: 0o755 });
  const result = shell(`export PATH=${quote(posix(mock))}:"$PATH"; sh ${quote(posix(join(repository, 'install.sh')))} --manifest ${quote(pathToFileURL(setup.manifest).href)}`, { env: setup.env });
  if (!expected) {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unsupported platform: Linux x86_64/);
    assert.equal(existsSync(join(setup.toolkit, 'active')), false);
    return;
  }
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const state = JSON.parse(readFileSync(join(setup.toolkit, '0.1.0/state.json')));
  assert.equal(state.platform, expected);
  assert.deepEqual(state.installed, ['studio', 'trace', 'print']);
  assert.equal(setup.action('uninstall').status, 0);
});

for (const [name, cpu, translated, expected, forced] of [
  ['forced Intel', 'arm64', '0', 'darwin-x64', true],
  ['Intel', 'x86_64', '0', 'darwin-x64', false],
  ['Apple Silicon', 'arm64', '0', 'darwin-arm64', false],
  ['Rosetta', 'x86_64', '1', 'darwin-arm64', false],
]) test(`rollback verifies the native platform on ${name}`, t => {
  const setup = installation(t);
  // A single-platform previous pack makes using the wrong platform observable.
  setup.pack.platforms = [expected];
  for (const artifact of [...Object.values(setup.pack.runtimes), ...setup.pack.tools]) {
    artifact.archives = { [expected]: artifact.archives['darwin-arm64'] };
  }
  setup.save();
  const install = () => shell(`sh ${quote(posix(join(repository, 'install.sh')))} --manifest ${quote(pathToFileURL(setup.manifest).href)} --platform ${expected}`, { env: setup.env });
  for (const version of ['0.1.0', '0.2.0']) {
    setup.pack.version = version; setup.save();
    const result = install();
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  }
  const mock = join(setup.root, 'rollback-platform-bin'); mkdirSync(mock);
  writeFileSync(join(mock, 'uname'), `#!/bin/sh\ncase "$1" in -s) echo Darwin;; -m) echo ${cpu};; *) exit 99;; esac\n`, { mode: 0o755 });
  writeFileSync(join(mock, 'sysctl'), `#!/bin/sh\necho ${translated}\n`, { mode: 0o755 });
  const result = shell(`export PATH=${quote(posix(mock))}:"$PATH"; sh ${quote(posix(join(repository, 'install.sh')))} rollback ${forced ? '--platform darwin-x64' : ''}`, { env: setup.env });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(readFileSync(join(setup.toolkit, 'active'), 'utf8'), '0.1.0\n0.2.0\n');
});
