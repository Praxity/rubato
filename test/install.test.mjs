import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { fixture, repository, examplePack } from './helpers.mjs';

import { installation, shell, posix, quote, archive } from './installer-fixture.mjs';
import { installationPlan } from '../src/manifest.mjs';

const passed = result => assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
test('POSIX bootstrap fresh install and idempotent rerun, with spaces and no profile edits', t => {
  const setup = installation(t);
  const plan = installationPlan(setup.pack, 'darwin-arm64');
  assert.deepEqual(plan.map(item => item.id), ['node', 'typst', 'studio', 'trace', 'print']);
  for (const item of plan) assert.equal(new URL(item.url).protocol, 'file:');
  writeFileSync(join(setup.home, '.profile'), 'User profile\n');
  writeFileSync(join(setup.home, 'AGENTS.md'), 'User instructions\n');
  passed(setup.install());
  const current = join(setup.toolkit, '0.1.0');
  assert.ok(existsSync(join(current, 'state.json')));
  assert.deepEqual(JSON.parse(readFileSync(join(current, 'state.json'))).installed, ['studio', 'trace', 'print']);
  assert.ok(existsSync(join(current, 'tools/studio/praxity.mjs')));
  assert.equal(existsSync(join(current, 'tools/check')), false);
  const before = readFileSync(join(current, 'state.json'), 'utf8');
  passed(setup.install());
  assert.equal(readFileSync(join(current, 'state.json'), 'utf8'), before);
  const version = shell(`${quote(posix(join(setup.home, '.praxity/bin/praxity')))} version`, { env: setup.env });
  passed(version); assert.equal(JSON.parse(version.stdout).pack, '0.1.0');
  assert.equal(readFileSync(join(setup.home, '.profile'), 'utf8'), 'User profile\n');
  assert.equal(readFileSync(join(setup.home, 'AGENTS.md'), 'utf8'), 'User instructions\n');
});
test('checksum mismatch refuses publication and launchers', t => {
  const setup = installation(t);
  setup.pack.tools[0].archives['darwin-arm64'].sha256 = 'a'.repeat(64); setup.save();
  const result = setup.install();
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Checksum mismatch/);
  assert.equal(existsSync(join(setup.toolkit, 'active')), false);
  assert.equal(existsSync(join(setup.toolkit, '0.1.0')), false);
  assert.equal(existsSync(join(setup.home, '.praxity/bin/praxity')), false);
});
test('interrupted install resumes from verified downloads', t => {
  const setup = installation(t);
  const mock = join(setup.root, 'mock bin'); mkdirSync(mock);
  const marker = join(setup.root, 'interrupted');
  const curl = shell('command -v curl'); passed(curl);
  writeFileSync(join(mock, 'curl'), `#!/bin/sh\ncase "${'$'}*" in *typst%20archive*) if [ ! -e ${quote(posix(marker))} ]; then touch ${quote(posix(marker))}; kill -TERM "${'$'}PPID"; exit 1; fi;; esac\nexec ${quote(curl.stdout.trim())} "${'$'}@"\n`, { mode: 0o755 });
  const original = setup.env.PATH;
  // A POSIX PATH is set inside bash, avoiding Windows PATH conversion rules.
  const result = shell(`export PATH=${quote(posix(mock))}:"${'$'}PATH"; sh ${quote(posix(join(repository, 'install.sh')))} --manifest ${quote(pathToFileURL(setup.manifest).href)} --platform darwin-arm64`, { env: setup.env });
  assert.notEqual(result.status, 0); assert.ok(existsSync(marker), result.stderr);
  assert.equal(existsSync(join(setup.toolkit, 'active')), false);
  const cache = readdirSync(join(setup.toolkit, '.cache')).filter(name => !name.endsWith('.part'));
  assert.ok(cache.includes(`${setup.pack.runtimes.node.archives['darwin-arm64'].sha256}.tar.gz`));
  setup.env.PATH = original;
  passed(setup.install());
  assert.equal(readFileSync(join(setup.toolkit, 'active'), 'utf8').split('\n')[0], '0.1.0');
});
test('update keeps previous version, rollback works through launcher, uninstall preserves unrelated data', t => {
  const setup = installation(t); passed(setup.install());
  setup.pack.version = '0.2.0'; setup.save(); passed(setup.install());
  assert.equal(readFileSync(join(setup.toolkit, 'active'), 'utf8').split('\n')[1], '0.1.0');
  const rolled = shell(`${quote(posix(join(setup.home, '.praxity/bin/praxity')))} rollback`, { env: setup.env });
  passed(rolled);
  assert.equal(readFileSync(join(setup.toolkit, 'active'), 'utf8').split('\n')[0], '0.1.0');
  assert.ok(existsSync(join(setup.toolkit, '0.2.0/state.json')));
  mkdirSync(join(setup.home, '.praxity/check'), { recursive: true });
  writeFileSync(join(setup.home, '.praxity/check/user-component'), 'Keep me');
  passed(setup.action('uninstall')); passed(setup.action('uninstall'));
  assert.equal(existsSync(join(setup.home, '.praxity/bin/praxity')), false);
  assert.equal(existsSync(join(setup.toolkit, '0.1.0')), false);
  assert.equal(readFileSync(join(setup.home, '.praxity/check/user-component'), 'utf8'), 'Keep me');
});
test('changed manifest and damaged installed files cannot silently replace a version', t => {
  const setup = installation(t);
  setup.pack.tools[1].version = '0.6.0'; setup.save();
  passed(setup.install());
  setup.pack.tools[1].version = '0.6.1'; setup.save();
  const changed = setup.install(); assert.notEqual(changed.status, 0); assert.match(changed.stderr, /different manifest/);
  setup.pack.tools[1].version = '0.6.0'; setup.save();
  writeFileSync(join(setup.toolkit, '0.1.0/tools/studio/praxity.mjs'), 'Modified');
  const damaged = setup.install(); assert.notEqual(damaged.status, 0); assert.match(damaged.stderr, /Installed file damaged/);
});
test('damaged cache and unsupported platform are refused', t => {
  const setup = installation(t);
  mkdirSync(join(setup.toolkit, '.cache'), { recursive: true });
  const archive = setup.pack.runtimes.node.archives['darwin-arm64'];
  writeFileSync(join(setup.toolkit, '.cache', `${archive.sha256}.tar.gz`), 'bad cache');
  const damaged = setup.install(); assert.notEqual(damaged.status, 0); assert.match(damaged.stderr, /Cached checksum mismatch/);
  const unsupported = setup.install('--platform linux-x64');
  assert.notEqual(unsupported.status, 0); assert.match(unsupported.stderr, /not implemented/);
});
test('quoted absolute launchers tolerate apostrophes as well as spaces', t => {
  const setup = installation(t, { homeName: "designer's home" });
  passed(setup.install());
  const version = shell(`${quote(posix(join(setup.home, '.praxity/bin/praxity')))} version`, { env: setup.env });
  passed(version); assert.equal(JSON.parse(version.stdout).pack, '0.1.0');
});
test('rollback refuses damaged previous version and keeps both pointers', t => {
  const setup = installation(t); passed(setup.install());
  setup.pack.version = '0.2.0'; setup.save(); passed(setup.install());
  writeFileSync(join(setup.toolkit, '0.1.0/tools/studio/praxity.mjs'), 'Damaged previous version');
  const before = readFileSync(join(setup.toolkit, 'active'), 'utf8');
  const result = setup.action('rollback');
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Installed file damaged/);
  assert.equal(readFileSync(join(setup.toolkit, 'active'), 'utf8'), before);
});
test('an escaping archive link never reaches extraction or activation', t => {
  const setup = installation(t);
  const header = Buffer.alloc(512);
  const field = (offset, length, value) => header.write(value, offset, length, 'ascii');
  field(0, 100, 'escape-link'); field(100, 8, '0000777\0');
  field(108, 8, '0000000\0'); field(116, 8, '0000000\0');
  field(124, 12, '00000000000\0'); field(136, 12, '00000000000\0');
  field(148, 8, '        '); field(156, 1, '2'); field(157, 100, '../../outside');
  field(257, 6, 'ustar\0'); field(263, 2, '00');
  const checksum = [...header].reduce((total, byte) => total + byte, 0);
  field(148, 8, `${checksum.toString(8).padStart(6, '0')}\0 `);
  const bytes = gzipSync(Buffer.concat([header, Buffer.alloc(1024)]));
  const malicious = join(setup.root, 'unsafe archive.tar.gz'); writeFileSync(malicious, bytes);
  setup.pack.tools[0].archives['darwin-arm64'] = { status: 'published', url: pathToFileURL(malicious).href,
    sha256: createHash('sha256').update(bytes).digest('hex'), format: 'tar.gz', stripComponents: 0 };
  setup.save();
  const result = setup.install();
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Unsafe archive link/);
  assert.equal(existsSync(join(setup.toolkit, 'active')), false);
  assert.equal(existsSync(join(setup.home, '.praxity/bin/praxity')), false);
  assert.equal(existsSync(join(setup.root, 'outside')), false);
});
test('bootstrap rejects duplicate JSON keys before downloading Node', t => {
  const setup = installation(t);
  writeFileSync(setup.manifest, '{"version":"0.1.0","version":"0.2.0"}');
  const result = setup.install();
  assert.notEqual(result.status, 0); assert.match(result.stderr, /duplicate key/);
  assert.equal(existsSync(join(setup.toolkit, '.cache')), false);
});
test('a published tool without its notices fails before activation', t => {
  const setup = installation(t);
  const bad = join(setup.root, 'incomplete legal payload'); mkdirSync(bad);
  writeFileSync(join(bad, 'praxity.mjs'), 'console.log("fixture");');
  setup.pack.tools[0].archives['darwin-arm64'] = archive(bad, join(setup.root, 'incomplete archive.tar.gz'));
  setup.save();
  const result = setup.install();
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Missing notices for studio/);
  assert.equal(existsSync(join(setup.toolkit, 'active')), false);
  assert.equal(existsSync(join(setup.toolkit, '0.1.0')), false);
});

test('finalize validates the whole stage before creating wrappers or metadata', t => {
  const setup = installation(t);
  const stage = join(setup.root, 'stage'); mkdirSync(stage);
  const outside = join(setup.root, 'outside'); mkdirSync(outside);
  symlinkSync(outside, join(stage, 'runtimes'), process.platform === 'win32' ? 'junction' : 'dir');
  const result = spawnSync(process.execPath, [join(repository, 'src/install.mjs'), 'finalize', setup.manifest, 'darwin-arm64', stage, setup.toolkit], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /symlink|containment/i);
  assert.equal(existsSync(join(stage, 'state.json')), false);
});

function remoteFixture(t, reviewed = false) {
  const setup = installation(t); setup.pack.version = '9.9.9'; setup.save();
  const bin = join(setup.root, 'curl-mock'); mkdirSync(bin);
  const realCurl = shell('command -v curl').stdout.trim();
  const manifest = reviewed ? join(repository, 'pack.json') : setup.manifest;
  writeFileSync(join(bin, 'curl'), `#!/bin/sh\nnext=\noutput=\nlast=\nfor arg do\n  if [ "$next" = output ]; then output=$arg; next=; fi\n  if [ "$arg" = --output ]; then next=output; fi\n  last=$arg\ndone\ncase "$last" in\n  https://fixture.invalid/manifest.json) cp ${quote(posix(manifest))} "$output";;\n  file://*) exec ${quote(realCurl)} "$@";;\n  *) echo 'network disallowed in fixture' >&2; exit 98;;\nesac\n`, { mode: 0o755 });
  const init = setup.env.BASH_ENV ?? posix(join(setup.root, 'bash-env'));
  const previous = existsSync(join(setup.root, 'bash-env')) ? readFileSync(join(setup.root, 'bash-env'), 'utf8') : '';
  writeFileSync(join(setup.root, 'bash-env'), previous + `export PATH=${quote(posix(bin))}:"$PATH"\n`);
  setup.env.BASH_ENV = init;
  return setup;
}
for (const digest of [null, 'a'.repeat(64)]) test(`remote replacement manifest with ${digest ? 'wrong' : 'no'} reviewed digest cannot select Node`, t => {
  const setup = remoteFixture(t);
  const r = setup.install(`--manifest https://fixture.invalid/manifest.json${digest ? ` --manifest-sha256 ${digest}` : ''}`);
  assert.notEqual(r.status, 0); assert.match(r.stderr, /Manifest SHA-256 mismatch|reviewed digest/);
  assert.equal(existsSync(join(setup.toolkit, '.cache')), false);
  assert.equal(existsSync(join(setup.toolkit, 'active')), false);
});
test('remote manifest with the supplied reviewed digest installs local fixture archives', t => {
  const setup = remoteFixture(t), digest = createHash('sha256').update(readFileSync(setup.manifest)).digest('hex');
  passed(setup.install(`--manifest https://fixture.invalid/manifest.json --manifest-sha256 ${digest}`));
  assert.equal(readFileSync(join(setup.toolkit, 'active'), 'utf8').split('\n')[0], '9.9.9');
});
test('remote bytes matching the reviewed checkout manifest pass trust preflight', t => {
  const setup = remoteFixture(t, true);
  const r = setup.install('--manifest https://fixture.invalid/manifest.json');
  assert.notEqual(r.status, 0); assert.match(r.stderr, /network disallowed in fixture/);
  assert.doesNotMatch(r.stderr, /Manifest SHA-256 mismatch/);
  assert.ok(existsSync(join(setup.toolkit, '.cache')));
});

for (const prior of [false, true]) test(`failed doctor restores the previous active pointer, prior=${prior}`, t => {
  const setup = installation(t);
  if (prior) passed(setup.install());
  setup.pack.version = '0.2.0'; setup.save();
  const node = join(setup.root, 'fake node/bin/node');
  writeFileSync(node, readFileSync(node, 'utf8').replace("echo 'fixture doctor: ok'; exit 0", "echo 'fixture doctor: failed' >&2; exit 1"));
  setup.pack.runtimes.node.archives['darwin-arm64'] = archive(join(setup.root, 'fake node'), join(setup.root, 'failed node.tar.gz'));
  setup.save();
  const result = setup.install();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /doctor failed.*restored the previous active pack/);
  assert.match(result.stderr, /rerun install/);
  if (prior) {
    assert.equal(readFileSync(join(setup.toolkit, 'active'), 'utf8'), '0.1.0\n\n');
    const version = shell(`${quote(posix(join(setup.home, '.praxity/bin/praxity')))} --version`, { env: setup.env });
    passed(version); assert.equal(JSON.parse(version.stdout).pack, '0.1.0');
  } else {
    assert.equal(existsSync(join(setup.toolkit, 'active')), false);
    assert.equal(existsSync(join(setup.home, '.praxity/bin/praxity')), false);
  }
});

test('uninstall removes the entire installer-owned toolkit and launcher', t => {
  const setup = installation(t); passed(setup.install());
  writeFileSync(join(setup.toolkit, '0.1.0/tools/studio/praxity.mjs'), 'Changed installed file');
  writeFileSync(join(setup.toolkit, 'extra'), 'Installer-owned folder');
  passed(setup.action('uninstall'));
  assert.equal(existsSync(setup.toolkit), false);
  assert.equal(existsSync(join(setup.home, '.praxity/bin/praxity')), false);
});
