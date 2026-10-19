import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Run: PRAXITY_BIN=/path/to/praxity.mjs node --test test/studio-review-e2e.test.mjs
// PRAXITY_BIN is one real Studio launcher or packaged .mjs/.js CLI path, not shell text.
// No variable, or a build without comments support, skips with a reason.
// Seed the documented local store format; every inspection, edit and reply uses the CLI.
// No browser assets or --review launcher are needed to exercise the comments procedure.
test('real Studio fixes one text comment and replies to an unsupported request without resolving it', { timeout: 90_000 }, t => {
  if (!process.env.PRAXITY_BIN) return t.skip('Set PRAXITY_BIN to a real Studio CLI with comments support.');
  const bin = resolve(process.env.PRAXITY_BIN);
  const nodeScript = /\.(?:mjs|js)$/i.test(bin);
  const executable = nodeScript ? process.execPath : bin;
  const prefix = nodeScript ? [bin] : [];
  const help = spawnSync(executable, [...prefix, 'comments', '--help'], { encoding: 'utf8', timeout: 15_000 });
  assert.ifError(help.error);
  if (help.status !== 0 || !/comments resolve/.test(help.stdout)) {
    return t.skip('PRAXITY_BIN does not support praxity comments --help; update Studio.');
  }
  const root = mkdtempSync(join(tmpdir(), 'praxity-review-fixture-'));
  const course = join(root, 'course');
  mkdirSync(course);
  t.after(() => rmSync(root, { recursive: true }));
  const source = '---\ntitle: Lesson 1\n---\n\n# Page 1\n\n## Original heading\n\nNeighbouring body stays unchanged.\n';
  const lesson = join(course, 'lesson.prax');
  writeFileSync(join(course, 'course.yaml'), 'title: A course\nlessons: [lesson.prax]\n');
  writeFileSync(lesson, source);

  function cli(args) {
    const result = spawnSync(executable, [...prefix, ...args], { cwd: course, encoding: 'utf8', timeout: 20_000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${args[0]} ${args[1]}: ${result.stderr || result.stdout}`);
    return args.includes('--json') ? JSON.parse(result.stdout) : result.stdout;
  }
  cli(['identity', 'init', '.']);
  const inspected = cli(['inspect', '.', '--text-fields', '--json']);
  // Fixture setup identifies its sole authored heading; fixing later joins only on anchor IDs.
  const fields = inspected.textFields.filter(field => field.kind === 'heading' && field.file === 'lesson.prax');
  assert.equal(fields.length, 1);
  const target = fields[0];
  assert.equal(target.text, 'Original heading');
  assert.ok(target.nodeId && target.ownerId && target.field && target.fileRevision && target.lessonId && target.pageId);

  const anchor = {
    courseId: null, lessonId: target.lessonId, pageId: target.pageId,
    nodeId: target.nodeId, blockId: target.ownerId, revision: target.fileRevision,
    quote: { type: 'TextQuoteSelector', exact: 'Original heading', prefix: '', suffix: '' },
    pin: null, tab: null, revealPath: [], cssPath: null,
    context: { pageTitle: 'Page 1', targetLabel: 'Heading' },
  };
  const reviewId = randomUUID();
  const reviewer = { id: randomUUID(), displayName: 'Reviewer', role: 'reviewer' };
  const at = '2026-10-19T00:00:00.000Z';
  const thread = (body, commentAnchor) => ({
    id: randomUUID(), reviewId, anchor: commentAnchor, status: 'open', version: 1,
    createdAt: at, updatedAt: at, resolution: null,
    messages: [{ id: randomUUID(), body, actor: reviewer, at, provenance: 'local-preview' }],
  });
  const supportedSeed = thread('Change the heading to "Revised heading".', anchor);
  const unsupportedSeed = thread('Redesign the whole page with a two-column layout.', {
    ...anchor, nodeId: null, blockId: null, quote: null,
  });
  const storage = join(course, '.praxity/reviews');
  mkdirSync(join(storage, reviewId), { recursive: true });
  writeFileSync(join(storage, '.gitignore'), '*\n');
  writeFileSync(join(storage, 'manifest.json'), JSON.stringify({
    schema: 1, initialized: true, reviewId,
    localPrincipal: { id: randomUUID(), displayName: 'Course author' },
  }));
  writeFileSync(join(storage, reviewId, 'comments.json'), JSON.stringify({
    schema: 1, reviewId, course: { namespace: null, bound: false }, changeSeq: 2,
    threads: [supportedSeed, unsupportedSeed], receipts: [],
  }));
  // The store owner validates these fixture bytes before the procedure can read them.
  const supportedId = supportedSeed.id;
  const unsupportedId = unsupportedSeed.id;

  const open = cli(['comments', 'list', '.', '--status', 'open', '--json']);
  assert.equal(open.threads.length, 2);
  const supported = open.threads.find(thread => thread.id === supportedId);
  const unsupported = open.threads.find(thread => thread.id === unsupportedId);
  const fresh = cli(['inspect', '.', '--text-fields', '--json']);
  const admitted = fresh.textFields.filter(field => field.nodeId === supported.anchor.nodeId && field.file === 'lesson.prax'
    && field.lessonId === supported.anchor.lessonId && field.pageId === supported.anchor.pageId);
  assert.equal(admitted.length, 1);
  const binding = admitted[0];
  assert.equal(binding.ownerId, supported.anchor.blockId);
  assert.equal(binding.text, supported.anchor.quote.exact);
  const edit = ['edit', '.', 'setText', '--at', binding.nodeId, '--rendered', '--arg', `field=${binding.field}`,
    '--arg', `text=${JSON.stringify('Revised heading')}`, '--expect-revision', binding.fileRevision];
  cli([...edit, '--dry-run', '--json']);
  assert.equal(readFileSync(lesson, 'utf8'), source, 'dry run preserves source');
  cli([...edit, '--json']);
  const saved = cli(['inspect', '.', '--text-fields', '--json']).textFields
    .filter(field => field.nodeId === binding.nodeId && field.file === binding.file);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].text, 'Revised heading');
  assert.equal(saved[0].ownerId, binding.ownerId);
  assert.equal(readFileSync(lesson, 'utf8'), source.replace('Original heading', 'Revised heading'));

  const fixedReply = 'Changed the heading to "Revised heading" and verified neighbouring source is unchanged.';
  const openReply = 'Left open: the requested two-column redesign is structural and is outside supported text edits.';
  const replyFile = join(root, 'fixed-reply.txt');
  const unsupportedFile = join(root, 'unsupported-reply.txt');
  writeFileSync(replyFile, fixedReply);
  writeFileSync(unsupportedFile, openReply);
  const resolution = ['comments', 'resolve', '.', supported.id, '--reply-file', replyFile,
    '--expect-version', String(supported.version), '--request-id', randomUUID(), '--json'];
  const resolved = cli(resolution);
  assert.equal(resolved.ok, true);
  assert.equal(cli(resolution).replayed, true, 'lost response retry does not append another reply');
  cli(['comments', 'reply', '.', unsupported.id, '--text-file', unsupportedFile,
    '--expect-version', String(unsupported.version), '--request-id', randomUUID(), '--json']);

  const remaining = cli(['comments', 'list', '.', '--status', 'open', '--json']);
  assert.deepEqual(remaining.threads.map(thread => thread.id), [unsupported.id]);
  const final = cli(['comments', 'list', '.', '--json']);
  assert.equal(final.threads.length, 2);
  const fixed = final.threads.find(thread => thread.id === supported.id);
  const leftOpen = final.threads.find(thread => thread.id === unsupported.id);
  assert.equal(fixed.status, 'resolved');
  assert.equal(fixed.messages.length, 2);
  assert.equal(fixed.messages[1].body, fixedReply);
  assert.equal(leftOpen.status, 'open');
  assert.equal(leftOpen.messages.length, 2);
  assert.equal(leftOpen.messages[1].body, openReply);
});
