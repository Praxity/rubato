import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { examplePack, realPack, repository } from './helpers.mjs';
import { manifestBumpError, validateManifest, validateReleaseManifest, installationPlan } from '../src/manifest.mjs';
import { loadSchema, validateSchema } from '../src/schema.mjs';

test('a manifest change must raise the pack version', () => {
  const base = examplePack(), head = examplePack();
  assert.equal(manifestBumpError(base, head), null);
  head.tools[0].version = 'changed';
  assert.match(manifestBumpError(base, head), /raise it/);
  head.version = '9.9.9';
  assert.equal(manifestBumpError(base, head), null);
});

test('a tool can record its full source revision, with malformed revisions refused', () => {
  const pack = examplePack(), studio = pack.tools.find(tool => tool.id === 'studio');
  studio.sourceRevision = 'abcdef0123456789abcdef0123456789abcdef01';
  assert.deepEqual(validateManifest(pack), []);
  for (const value of ['abcdef01', 'ABCDEF0123456789ABCDEF0123456789ABCDEF01', '../not-a-revision', null]) {
    studio.sourceRevision = value;
    assert.ok(validateManifest(pack).some(error => error.includes('sourceRevision')));
  }
});

test('real pack validates and every published archive has a complete contract', () => {
  const pack = realPack();
  assert.equal(pack.version, '0.1.3');
  assert.equal(JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8')).version, pack.version);
  assert.deepEqual(validateSchema(pack, loadSchema('pack')), []);
  assert.deepEqual(validateManifest(pack), []);
  assert.deepEqual(validateReleaseManifest(pack), []);
  for (const artifact of [...Object.values(pack.runtimes), ...pack.tools]) {
    for (const [platform, archive] of Object.entries(artifact.archives)) {
      if (archive.status !== 'published') continue;
      for (const field of ['url', 'sha256', 'format', 'stripComponents']) {
        assert.ok(Object.hasOwn(archive, field), `${artifact.id ?? artifact.version}/${platform}: missing ${field}`);
      }
    }
  }
});

// Trace revisions whose item-cues carry what the assessment-writing gate reads: `<bundle>-review/operator.json`
// (Praxity/praxity-trace#22), `status: "scored"` masked results from Studio language provenance (#23), and per-row
// `excludedByReason`, `maskedExcludedCount` and coded `excluded` records (#24). An older pin can't reach a verdict:
// 09fcaaf has no masked probe, 92a164d holds every result, and 97e6de3 makes every gate return "tooling".
// Add a revision here only after checking its payload.
// 9036868 retains that contract with item-cues/14 and masked-only preparation by default (#25).
const maskedTraceRevisions = new Set(['9036868d4ba3f55aced52077b5b548eb1374ac72']);
const pinsMaskedTrace = pack => maskedTraceRevisions.has(pack.tools.find(tool => tool.id === 'trace')?.sourceRevision);

test('the pinned Trace ships the masked item-cues contract the assessment skill gates on', () => {
  const pack = realPack();
  assert.ok(pinsMaskedTrace(pack), 'Pin a Trace revision with the masked item-cues contract and exclusion accounting');
  const skill = readFileSync(join(repository, 'skills/assessment-writing/SKILL.md'), 'utf8');
  assert.match(skill, /`<bundle>-review\/`/);
  assert.match(skill, /row\.masked\.status === 'scored'[\s\S]*row\.masked\.right[\s\S]*item\.lengths\.length/);
  assert.match(skill, /excludedByReason[\s\S]*maskedExcludedCount[\s\S]*record\.code/);
  const old = realPack();
  for (const revision of ['09fcaaf76841175d150210ec29c66d7ebab05cc3', '92a164dd8573ff80fd24c61614b229f62f0eff2a', '97e6de33b3c30e67d44e7db6d0f1856bf358d3ef']) {
    old.tools.find(tool => tool.id === 'trace').sourceRevision = revision;
    assert.equal(pinsMaskedTrace(old), false, `${revision.slice(0, 7)} predates the gate's contract`);
  }
});

test('unpublished fixture tools are omitted from the installation plan', () => {
  const pack = examplePack();
  assert.deepEqual(validateManifest(pack), []);
  assert.deepEqual(installationPlan(pack, 'darwin-arm64').map(item => item.id), ['node', 'typst']);
  assert.throws(() => installationPlan(pack, 'linux-x64'), /Unsupported platform/);
});

test('every declared platform requires every tool archive', () => {
  for (const tool of realPack().tools) {
    const pack = realPack();
    pack.platforms = ['darwin-arm64', 'darwin-x64'];
    delete pack.tools.find(entry => entry.id === tool.id).archives['darwin-x64'];
    assert.ok(validateManifest(pack).some(error => error.includes(`${tool.id}/archives/darwin-x64: required`)));
  }
});

test('manifest cannot omit a tool from the pack', () => {
  const pack = realPack();
  pack.tools.pop();
  assert.ok(validateManifest(pack).length);
});

test('release validation refuses unpublished tool placeholders on a supported platform', () => {
  const pack = examplePack();
  pack.platforms = ['darwin-arm64'];
  assert.deepEqual(validateManifest(pack), []);
  assert.ok(validateReleaseManifest(pack).some(error => error.includes('unpublished')));
  for (const tool of pack.tools) for (const platform of pack.platforms) {
    tool.archives[platform] = { ...pack.runtimes.node.archives[platform] };
  }
  assert.deepEqual(validateReleaseManifest(pack), []);
  // Unpublished platforms outside the release remain allowed.
  delete pack.tools[0].archives['darwin-x64'];
  pack.platforms.push('darwin-x64');
  assert.ok(validateReleaseManifest(pack).length);
});
test('published archive has a complete executable contract', () => {
  const pack = examplePack();
  pack.tools[0].archives['darwin-arm64'] = { status: 'published', url: 'file:///tmp/tool%20archive.tar.gz', sha256: 'a'.repeat(64), format: 'tar.gz', stripComponents: 1 };
  assert.deepEqual(validateManifest(pack), []);
  const plan = installationPlan(pack, 'darwin-arm64');
  assert.deepEqual(plan.map(item => item.id), ['node', 'typst', 'studio']);
  assert.equal(plan.find(item => item.id === 'studio').entry, 'praxity.mjs');
});
test('runtime hashes match the preserved official release evidence', () => {
  const pack = realPack();
  const checksums = readFileSync(join(repository, 'docs/provenance/node-v24.22.1-SHASUMS256.txt'), 'utf8');
  const typst = JSON.parse(readFileSync(join(repository, 'docs/provenance/typst-v0.15.1-assets.json'), 'utf8'));
  for (const archive of Object.values(pack.runtimes.node.archives)) {
    const file = new URL(archive.url).pathname.split('/').at(-1);
    assert.ok(checksums.split(/\r?\n/).includes(`${archive.sha256}  ${file}`));
  }
  for (const archive of Object.values(pack.runtimes.typst.archives)) {
    const asset = typst.assets.find(asset => asset.browser_download_url === archive.url);
    assert.equal(asset?.digest, `sha256:${archive.sha256}`);
  }
});
const bad = {
  'unknown field': p => p.surprise = 1,
  'unsafe version': p => p.version = '../../outside',
  'Node 23': p => p.runtimes.node.version = '23.1.0',
  'Node below minimum': p => p.runtimes.node.version = '24.17.9',
  'Node 25': p => p.runtimes.node.version = '25.0.0',
  'bad checksum': p => p.runtimes.node.archives['darwin-arm64'].sha256 = 'BAD',
  'insecure URL': p => p.runtimes.node.archives['darwin-arm64'].url = 'http://example.com/node.tgz',
  'missing runtime entry': p => delete p.runtimes.typst.entry['darwin-arm64'],
  'unsupported platform': p => p.platforms.push('linux-arm64'),
  'duplicate platform': p => p.platforms.push('darwin-arm64'),
  'duplicate tool': p => p.tools.push(structuredClone(p.tools[0])),
  'missing platform archive': p => delete p.tools[0].archives['darwin-arm64'],
  'unpublished without reason': p => delete p.tools[0].archives['darwin-arm64'].reason,
  'invented unpublished URL': p => p.tools[0].archives['darwin-arm64'].url = 'https://example.com/invented.tgz',
  'published without checksum': p => p.tools[0].archives['darwin-arm64'] = { status: 'published', url: 'https://example.com/tool.tgz', format: 'tar.gz', stripComponents: 1 },
};
for (const [name, mutate] of Object.entries(bad)) test(`manifest rejects ${name}`, () => {
  const pack = examplePack(); mutate(pack);
  assert.ok(validateManifest(pack).length, name);
});
test('doctor wire schema requires stable fields and known statuses', () => {
  const schema = loadSchema('doctor');
  const result = { schemaVersion: 2, packVersion: '0.1.0', exitCode: 1, items: [{ id: 'tool.check', status: 'failed', message: 'broken', fix: 'praxity setup check' }] };
  assert.deepEqual(validateSchema(result, schema), []);
  result.items[0].status = 'maybe';
  assert.ok(validateSchema(result, schema).length);
  result.items[0].status = 'ok'; delete result.items[0].fix;
  assert.ok(validateSchema(result, schema).length);
  assert.throws(() => validateSchema({}, { unexpectedVocabulary: true }), /Unsupported schema keyword/);
});

const pathFields = {
  'tool entry': (p, v) => { p.tools[0].entry = v; },
  'tool notices': (p, v) => { p.tools[0].notices = v; },
  'tool skill path': (p, v) => { p.tools[0].skillPath = v; },
  'runtime notices': (p, v) => { p.runtimes.node.notices = v; },
  'runtime entry': (p, v) => { p.runtimes.node.entry['darwin-arm64'] = v; },
};
for (const [field, set] of Object.entries(pathFields)) test(`manifest refuses an escaping or absolute ${field}`, () => {
  for (const value of ['../outside', 'bin/../../outside', '/usr/bin/node', 'C:/node.exe', 'bin\\node']) {
    const pack = examplePack(); set(pack, value);
    assert.ok(validateManifest(pack).length, `${field}: ${value}`);
  }
});
