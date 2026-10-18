import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installation, archive, posix, quote } from './installer-fixture.mjs';

for (const update of [false, true]) for (const failing of ['version', 'doctor']) {
  test(`${failing} failure restores ${update ? 'previous activation' : 'no activation'}`, t => {
    const setup = installation(t, { tool: false });
    if (update) {
      const first = setup.install();
      assert.equal(first.status, 0, first.stderr);
      setup.pack.version = '0.2.0';
    }
    const calls = join(setup.root, 'certification.log');
    const node = join(setup.root, 'fake node/bin/node');
    writeFileSync(node, readFileSync(node, 'utf8').replace('#!/bin/sh\n', `#!/bin/sh\ncase "${'$'}{1:-}" in */src/cli.mjs)\n case "${'$'}{2:-}" in version|doctor)\n printf '%s\\n' "$2" >> ${quote(posix(calls))}\n [ "$2" != ${quote(failing)} ] || exit 27\n esac;; esac\n`));
    setup.pack.runtimes.node.archives['darwin-arm64'] = archive(join(setup.root, 'fake node'), join(setup.root, 'failing-node.tar.gz'));
    setup.save();
    const result = setup.install();
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stderr, /Activation.*failed/);
    assert.equal(existsSync(join(setup.toolkit, 'active')), update);
    if (update) assert.equal(readFileSync(join(setup.toolkit, 'active'), 'utf8'), '0.1.0\n\n');
    if (!update) {
      assert.equal(existsSync(join(setup.home, '.praxity/bin/praxity')), false);
      assert.equal(existsSync(join(setup.toolkit, '.launcher-sha256')), false);
    }
    assert.match(result.stderr, /Resolve the version or doctor error and rerun/);
    assert.equal(existsSync(join(setup.toolkit, '.activation-pending')), false);
    assert.deepEqual(readFileSync(calls, 'utf8').trim().split('\n'), failing === 'version' ? ['version'] : ['version', 'doctor']);
  });
}
