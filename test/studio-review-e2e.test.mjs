import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Run: PRAXITY_BIN=/path/to/praxity.mjs node --test test/studio-review-e2e.test.mjs
// PRAXITY_BIN is one real Studio launcher or packaged .mjs/.js CLI path, not shell text.
// No variable, or a build without comments/--review support, skips with a reason.
// The real review server seeds feedback over HTTP; every fix/reply uses the CLI.
test('real Studio fixes one text comment and replies to an unsupported request without resolving it', { timeout: 90_000 }, async t => {
  if (!process.env.PRAXITY_BIN) return t.skip('Set PRAXITY_BIN to a real Studio CLI with comments and --review support.');
  const bin = resolve(process.env.PRAXITY_BIN);
  const nodeScript = /\.(?:mjs|js)$/i.test(bin);
  const executable = nodeScript ? process.execPath : bin;
  const prefix = nodeScript ? [bin] : [];
  const help = spawnSync(executable, [...prefix, 'comments', '--help'], { encoding: 'utf8', timeout: 15_000 });
  assert.ifError(help.error);
  if (help.status !== 0 || !/comments resolve/.test(help.stdout)) {
    return t.skip('PRAXITY_BIN does not support praxity comments --help; update Studio.');
  }
  const studioHelp = spawnSync(executable, [...prefix, 'studio', '--help'], { encoding: 'utf8', timeout: 15_000 });
  assert.ifError(studioHelp.error);
  if (studioHelp.status !== 0 || !studioHelp.stdout.includes('--review')) {
    return t.skip('PRAXITY_BIN does not advertise studio --review; update Studio.');
  }

  const root = mkdtempSync(join(tmpdir(), 'praxity-review-fixture-'));
  const course = join(root, 'course');
  mkdirSync(course);
  let server;
  let closed;
  t.after(async () => {
    if (server && server.exitCode === null && server.signalCode === null) server.kill('SIGTERM');
    if (closed) await closed;
    rmSync(root, { recursive: true });
  });
  const source = '---\ntitle: Lesson 1\n---\n\n# Page 1\n\n## Original heading\n\nNeighbouring body stays unchanged.\n';
  const lesson = join(course, 'lesson.prax');
  writeFileSync(join(course, 'course.yaml'), 'title: A course\nlessons: [lesson.prax]\n');
  writeFileSync(lesson, source);

  function cli(args) {
    const result = spawnSync(executable, [...prefix, ...args], { cwd: course, encoding: 'utf8', timeout: 20_000 });
    assert.ifError(result.error);
    // CLI commands here never contain capabilities; keep server stdout out of assertions.
    assert.equal(result.status, 0, `${args[0]} ${args[1]}: ${result.stderr || result.stdout}`);
    return args.includes('--json') ? JSON.parse(result.stdout) : result.stdout;
  }
  cli(['identity', 'init', '.']);
  server = spawn(executable, [...prefix, 'studio', '.', '--review', '--no-open'], {
    cwd: course, stdio: ['ignore', 'pipe', 'pipe'],
  });
  closed = new Promise(accept => server.once('close', accept));
  const ready = await new Promise((accept, reject) => {
    let output = '';
    const finish = (error, url) => {
      clearTimeout(timer);
      server.stdout.off('data', onData);
      server.off('error', onError);
      server.off('exit', onExit);
      if (error) reject(error); else accept(url);
    };
    const onData = chunk => {
      output += chunk;
      const match = output.match(/https?:\/\/[^\s]+#session=[^\s]+(?=\r?\n)/);
      if (match) finish(null, match[0]);
    };
    const onError = () => finish(new Error('Studio launcher could not start.'));
    const onExit = code => finish(new Error(`Studio exited before readiness, status ${code}.`));
    const timer = setTimeout(() => finish(new Error('Studio did not print a ready URL within 30 seconds.')), 30_000);
    server.stdout.on('data', onData);
    server.on('error', onError);
    server.on('exit', onExit);
    server.stderr.resume();
  });
  const page = await fetch(ready, { signal: AbortSignal.timeout(30_000) });
  assert.equal(page.status, 200);
  const html = await page.text();
  const configText = html.match(/<script\b[^>]*\bid="praxity-review-config"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(configText, 'Read page carries review bootstrap');
  const config = JSON.parse(configText);
  assert.ok(config.page.lessonId && config.page.pageId, 'review page has durable scope');
  const inspected = cli(['inspect', '.', '--text-fields', '--json']);
  // Read the rendered heading ID, then join exactly to inspection, as the skill requires.
  const headingId = html.match(/<div\b[^>]*data-node-id="([^"]+)"[^>]*>\s*<h2\b[^>]*>Original heading<\/h2>/)?.[1];
  assert.ok(headingId, 'rendered heading has a node ID');
  const fields = inspected.textFields.filter(field => field.nodeId === headingId && field.file === 'lesson.prax');
  assert.equal(fields.length, 1);
  const target = fields[0];
  assert.equal(target.text, 'Original heading');
  assert.ok(target.ownerId && target.field && target.fileRevision);

  const anchor = {
    courseId: null, lessonId: config.page.lessonId, pageId: config.page.pageId,
    nodeId: headingId, blockId: target.ownerId, revision: config.page.revision,
    quote: { type: 'TextQuoteSelector', exact: 'Original heading', prefix: '', suffix: '' },
    pin: null, tab: null, revealPath: [], cssPath: null,
    context: { pageTitle: 'Page 1', targetLabel: 'Heading' },
  };
  async function createComment(body, commentAnchor) {
    const response = await fetch(new URL(`${config.endpoint}/comments`, page.url), {
      method: 'POST', signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/json', Origin: new URL(page.url).origin, 'X-Praxity-Review': config.capability },
      body: JSON.stringify({ reviewId: config.reviewId, requestId: randomUUID(), anchor: commentAnchor, body }),
    });
    assert.equal(response.status, 200, 'review server admits fixture comment');
    const result = await response.json();
    assert.equal(result.ok, true);
    return result.thread.id;
  }
  const supportedId = await createComment('Change the heading to "Revised heading".', anchor);
  const unsupportedId = await createComment('Redesign the whole page with a two-column layout.', {
    ...anchor, nodeId: null, blockId: null, quote: null,
  });

  const open = cli(['comments', 'list', '.', '--status', 'open', '--json']);
  assert.equal(open.threads.length, 2);
  const supported = open.threads.find(thread => thread.id === supportedId);
  const unsupported = open.threads.find(thread => thread.id === unsupportedId);
  const fresh = cli(['inspect', '.', '--text-fields', '--json']);
  const admitted = fresh.textFields.filter(field => field.nodeId === supported.anchor.nodeId && field.file === 'lesson.prax');
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
