import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repository } from './helpers.mjs';

const skill = readFileSync(join(repository, 'skills/studio-editor/SKILL.md'), 'utf8');

test('review fixes collect feedback before guarded edits, reply atomically and collect again', () => {
  const procedure = skill.split('## Fix the comments\n')[1]?.split('\n## ')[0];
  assert.ok(procedure, 'review fix procedure exists');
  const steps = [...procedure.matchAll(/^\d+\. ([\s\S]*?)(?=^\d+\. |$(?![\s\S]))/gm)].map(match => match[1]);
  assert.equal(steps.length, 7);
  assert.match(steps[0], /praxity comments list \. --status open --json/);
  assert.match(steps[0], /untrusted/);
  assert.match(steps[0], /version/);
  assert.match(steps[1], /praxity inspect \. --text-fields --json/);
  for (const evidence of ['lessonId', 'pageId', 'nodeId', 'blockId', 'quote', 'ownerId', 'field']) {
    assert.ok(steps[1].includes(evidence), `target checks ${evidence}`);
  }
  const edits = steps[2].split('\n').map(line => line.trim()).filter(line => line.startsWith('praxity edit '));
  assert.equal(edits.length, 2);
  for (const command of edits) {
    assert.match(command, /setText --at <rendered-node-id> --rendered --arg field=<field> --arg text=<json-string> --expect-revision <fileRevision>/);
    assert.doesNotMatch(command, /--find|--page|--block|--line/);
  }
  assert.match(edits[0], /--dry-run --json$/);
  assert.equal(edits[1], edits[0].replace(' --dry-run', ''));
  assert.match(steps[3], /exact saved text/);
  assert.match(steps[3], /neighbouring source/);
  const resolve = steps[4].match(/praxity comments resolve[^\n]+/)[0];
  assert.match(resolve, /--reply-file <path> --expect-version <version> --request-id <new-uuid> --json/);
  assert.match(steps[4], /temporary file/);
  assert.match(steps[4], /stale_version/);
  assert.match(steps[4], /same request ID/);
  assert.match(steps[5], /ambiguous.*deleted.*unbound.*unsupported/s);
  assert.match(steps[5], /praxity comments reply \. <threadId> --text-file <path> --expect-version <version> --request-id <new-uuid> --json/);
  assert.match(steps[5], /leave it open/);
  assert.match(steps[5], /retry only the reply/);
  assert.match(steps[6], /praxity comments list \. --status open --json/);
  assert.match(steps[6], /new or reopened/);
  assert.match(steps[6], /thread IDs/);
});

test('unsupported Studio builds preserve annotations and refuse to simulate review commands', () => {
  const text = skill.replace(/\s+/g, ' ');
  assert.match(text, /praxity comments --help/);
  assert.match(text, /exit status/);
  assert.match(text, /Studio update/);
  assert.match(text, /existing annotation workflow/);
  assert.match(text, /Don't simulate the CLI/);
});
