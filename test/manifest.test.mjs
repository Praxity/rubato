import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { examplePack, realPack, repository } from './helpers.mjs';
import { validateManifest, validateReleaseManifest, installationPlan } from '../src/manifest.mjs';
import { loadSchema, validateSchema } from '../src/schema.mjs';

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
  assert.equal(pack.version, '0.1.1');
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

test('real pack preserves the unchanged tool archive URLs from v0.1.1', () => {
  const pack = realPack();
  const prefix = `https://github.com/Praxity/praxity-toolkit/releases/download/v${pack.version}/`;
  for (const tool of pack.tools) {
    if (['studio', 'check', 'trace'].includes(tool.id)) continue;
    for (const archive of Object.values(tool.archives)) {
      if (archive.status === 'published') assert.ok(archive.url.startsWith(prefix), tool.id);
    }
  }
});

test('macOS installation plans select the reviewed Studio, Check and Trace prereleases', () => {
  const pack = realPack();
  const candidates = [
    // Studio's admitted CLI candidate 40482412553 includes review comment fixes and zod 4.
    { id: 'studio', version: '0.3.0-main.80a30987', revision: '80a3098752a89ebdf729e5418d4e6750aa121de8',
      urls: { 'darwin-arm64': 'https://github.com/Praxity/rubato/releases/download/v0.1.1-tools.experimental.20261027.1/praxity-studio-cli-0.3.0-darwin-arm64.tar.gz',
        'darwin-x64': 'https://github.com/Praxity/rubato/releases/download/v0.1.1-tools.experimental.20261027.1/praxity-studio-cli-0.3.0-darwin-x64.tar.gz' },
      digests: { 'darwin-arm64': '71a10a0bd775584548dd79d760c7f1d51b4049022d4f6619e975727581f4bea8',
        'darwin-x64': 'f158d3e47dd560847ef37d736af854cce6ff0a8b846654a0c47914ddeb89bd92' } },
    { id: 'check', version: '0.6.0-alpha.c61b1cb3c', revision: 'c61b1cb3ce3a4e7afb0a44f3dd70e82a52c1154d',
      url: 'https://github.com/Praxity/rubato/releases/download/v0.1.1-tools.experimental.20261019/praxity-check-0.6.0-alpha.c61b1cb3c-portable.tar.gz' },
    { id: 'trace', version: '0.1.1-experimental.9036868d4', revision: '9036868d4ba3f55aced52077b5b548eb1374ac72',
      url: 'https://github.com/Praxity/rubato/releases/download/v0.1.1-tools.experimental.20261024.1/praxity-trace-0.1.1-experimental.9036868d4-portable.tar.gz',
      digests: { 'darwin-arm64': '1100054db6565d04d186f2190946dc7309977ee805b32286e1f0fe613a08e0d8',
        'darwin-x64': '1100054db6565d04d186f2190946dc7309977ee805b32286e1f0fe613a08e0d8' } },
  ];
  for (const candidate of candidates) {
    const tool = pack.tools.find(tool => tool.id === candidate.id);
    assert.equal(tool.version, candidate.version);
    assert.equal(tool.sourceRevision, candidate.revision);
    for (const platform of ['darwin-arm64', 'darwin-x64']) {
      const archive = installationPlan(pack, platform).find(entry => entry.id === candidate.id);
      assert.equal(archive.url, candidate.urls?.[platform] ?? candidate.url);
      if (candidate.digests) assert.equal(archive.sha256, candidate.digests[platform]);
      assert.equal(archive.format, 'tar.gz');
      assert.equal(archive.stripComponents, 1);
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

for (const platform of ['darwin-arm64', 'darwin-x64']) test(`installation plan selects ${platform} archives`, () => {
  const pack = realPack();
  const plan = installationPlan(pack, platform);
  assert.equal(plan.find(entry => entry.id === 'node').url, `https://nodejs.org/dist/v24.22.1/node-v24.22.1-${platform}.tar.gz`);
  assert.equal(plan.find(entry => entry.id === 'studio').url, `https://github.com/Praxity/rubato/releases/download/v0.1.1-tools.experimental.20261027.1/praxity-studio-cli-0.3.0-${platform}.tar.gz`);
});

test('every declared platform requires every tool archive', () => {
  for (const tool of realPack().tools) {
    const pack = realPack();
    pack.platforms = ['darwin-arm64', 'darwin-x64'];
    delete pack.tools.find(entry => entry.id === tool.id).archives['darwin-x64'];
    assert.ok(validateManifest(pack).some(error => error.includes(`${tool.id}/archives/darwin-x64: required`)));
  }
});

test('portable tools reuse their archives on both macOS architectures', () => {
  const pack = realPack();
  for (const id of ['check', 'trace', 'print', 'import']) {
    const tool = pack.tools.find(tool => tool.id === id);
    assert.equal(tool.archives['darwin-x64'].status, 'published');
    assert.deepEqual(tool.archives['darwin-x64'], tool.archives['darwin-arm64'], id);
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
  'path traversal': p => p.tools[0].entry = '../outside',
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

test('all archive entry and notices paths reference the schema owning path grammar', () => {
  const schema = JSON.parse(readFileSync(join(repository, 'schemas/pack.schema.json'), 'utf8'));
  const paths = [schema.$defs.tool.properties.entry, schema.$defs.tool.properties.notices, schema.$defs.tool.properties.skillPath,
    schema.$defs.runtime.properties.notices, ...Object.values(schema.$defs.runtime.properties.entry.properties)];
  assert.equal(paths.length, 8);
  for (const path of paths) assert.deepEqual(path, { $ref: '#/$defs/path' });
});
