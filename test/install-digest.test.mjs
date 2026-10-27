import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installation } from './installer-fixture.mjs';
import { installationPlan } from '../src/manifest.mjs';

test('install logs both digests for every verified archive, including cached archives', t => {
  const setup = installation(t);
  const typst = setup.pack.runtimes.typst.archives['darwin-arm64'];
  // Fixed tar.gz of the fixture's typst and LICENSE, without host tar timestamps.
  writeFileSync(fileURLToPath(typst.url), Buffer.from('H4sIAAAAAAAACiupLCguYaAtMDAwMDA3NQXTBgYG6LSBgZEhgg0WNzcwMWdQMKCxu8CgtLgksYjBgC52DUKgrKiflJmnX5zBlVqRWaJgwDXQDhoFdAU+ns6ufsGuNLUDlKnNTEzw5H8ztPxvZm5qMJr/6QFCQOW/QlpmRUlpUapCTmZyal5y6mghMApGwSgYBcMeAADNjljWAAwAAA==', 'base64'));
  typst.sha256 = 'cdaa2424b8e0ca7d449d836f53cfd04040e5d5c786841c25025fe7e9c5a94b76';
  setup.save();

  const result = setup.install();
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const lines = result.stdout.split('\n').filter(line => line.startsWith('verified '));
  assert.ok(lines.includes('verified typst%20archive.tar.gz sha256 cdaa2424b8e0ca7d449d836f53cfd04040e5d5c786841c25025fe7e9c5a94b76 (expected cdaa2424b8e0ca7d449d836f53cfd04040e5d5c786841c25025fe7e9c5a94b76)'));
  const plan = installationPlan(setup.pack, 'darwin-arm64');
  for (const entry of plan) {
    const line = `verified ${new URL(entry.url).pathname.split('/').at(-1)} sha256 ${entry.sha256} (expected ${entry.sha256})`;
    assert.equal(lines.filter(value => value === line).length, 1, line);
  }
  assert.equal(lines.length, plan.length);

  const rerun = setup.install();
  assert.equal(rerun.status, 0, `${rerun.stdout}\n${rerun.stderr}`);
  const node = setup.pack.runtimes.node.archives['darwin-arm64'];
  assert.deepEqual(rerun.stdout.split('\n').filter(line => line.startsWith('verified ')), [
    `verified node%20archive.tar.gz sha256 ${node.sha256} (expected ${node.sha256})`,
  ]);
});

for (const cached of [false, true]) test(`checksum refusal logs both digests, cached=${cached}`, t => {
  const setup = installation(t);
  const archive = cached ? setup.pack.runtimes.node.archives['darwin-arm64'] : setup.pack.tools[0].archives['darwin-arm64'];
  archive.sha256 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  setup.save();
  const cache = join(setup.toolkit, '.cache');
  if (cached) mkdirSync(cache, { recursive: true });
  writeFileSync(cached ? join(cache, `${archive.sha256}.tar.gz`) : fileURLToPath(archive.url), 'abc');

  const result = setup.install();
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, cached ? /Cached checksum mismatch/ : /Checksum mismatch/);
  const name = cached ? 'node%20archive.tar.gz' : 'studio%20archive.tar.gz';
  assert.ok(result.stderr.includes(`${name} sha256 ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad (expected aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)`), result.stderr);
  assert.doesNotMatch(result.stdout, new RegExp(`^verified ${name} `, 'm'));
  assert.equal(existsSync(join(setup.toolkit, 'active')), false);
  assert.equal(existsSync(join(setup.toolkit, '.install.lock')), false);
  assert.equal(existsSync(join(setup.home, '.praxity/bin/praxity')), false);
});
