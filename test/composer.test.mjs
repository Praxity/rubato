import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const assets = fileURLToPath(new URL('./composer/', import.meta.url));
const cases = [
  ['01-store-returns', ['dialogue-branching', 'checklist'], 'Correct the old till limits.'],
  ['02-incident-reviews', ['self-check', 'worked-example']],
  ['03-heat-and-temperature', ['knowledge-check', 'self-check', 'written-task']],
  ['04-phone-privacy-refresher', ['check-first', 'scenario', 'final-check'], 'Make the consent field easy to find.'],
  ['05-scam-texts', ['dont-know', 'retrieval-sheet', 'knowledge-check'], 'Provide a library drop-in hour.'],
];

test('composer prefers another family and still runs a labelled fresh-context review on single-family hosts', () => {
  const skill = readFileSync(new URL('../skills/composer/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /fidelity reviewer also judges alignment/);
  assert.match(skill, /fresh-context reviewer from a different model family than the writer/);
  assert.match(skill, /no other model family is available, run a fresh-context reviewer from the same family/);
  assert.match(skill, /different model if one is available/);
  assert.match(skill, /"same-family review"/);
  assert.match(skill, /A draft is not ready to export[^\n]*outline\.md[^\n]*report[^\n]*needing an independent review/);
});

test('composer feedback and fidelity rules accept sourced neighbouring cases', () => {
  const skill = readFileSync(new URL('../skills/composer/SKILL.md', import.meta.url), 'utf8');
  const writing = skill.split('## 7. Hand off the writing')[1].split('## 8.')[0];
  assert.match(writing, /Feedback adds no claim that the course or the brief's sources don't support/);
  assert.match(writing, /neighbouring-case explanation[^\n]*course teaches that case or a cited source states it/);
  assert.match(writing, /Otherwise add that teaching first, or drop the option/);
  const fidelity = skill.split('1. Fidelity.')[1].split('2. Run')[0];
  assert.match(fidelity, /checks support[^\n]*course or cited sources/);
  assert.doesNotMatch(skill, /adds no new claims|each claim the teaching doesn't support/);
});

test('French banks run the available probes and remain unverified drafts', () => {
  const skill = readFileSync(new URL('../skills/composer/SKILL.md', import.meta.url), 'utf8');
  const attack = skill.split('2. Write every keyed')[1].split('3. Sort facts')[0];
  assert.match(attack, /masked gate covers English only/);
  assert.match(attack, /French[^\n]*plain choices-only and cover-the-options probes/);
  assert.match(attack, /masked gate as "not applicable"/);
  assert.match(attack, /bank unverified[^\n]*course a draft[^\n]*ask the person/);
  assert.match(attack, /In an unattended run, stop/);
});

test('composer routing and export order preserve the owning skills and draft gates', () => {
  const skill = readFileSync(new URL('../skills/composer/SKILL.md', import.meta.url), 'utf8');
  const description = skill.match(/^description: (.*)$/m)[1];
  assert.doesNotMatch(description, /new course, module or lesson/);
  assert.match(skill, /For a lesson added to an existing outline, use prax-format directly/);
  assert.match(skill, /Agree on French register/);
  assert.match(skill, /When the choice is `tu`, tell the person[^\n]*mismatch[^\n]*Questions/);
  assert.match(skill, /course includes French and the register or regional variety is unstated/);
  assert.match(skill, /steps 1 to 6 of its build list; export comes in step 8/);
  assert.match(skill, /Once no draft blocker remains, export/);
  const patterns = readFileSync(new URL('../skills/composer/patterns.md', import.meta.url), 'utf8');
  assert.match(patterns.split('### dont-know')[1].split('### knowledge-check')[0], /don't choose `dont-know`, set `dontKnow=false` on practice choices/);
  const template = readFileSync(new URL('../skills/composer/outline-template.md', import.meta.url), 'utf8');
  assert.doesNotMatch(template, /nightly check/);
});

test('composer fixtures cover all five briefs', () => {
  assert.deepEqual(readdirSync(join(assets, 'fixtures')).sort(), cases.map(([id]) => id));
  for (const [id] of cases) assert.ok(readFileSync(join(assets, 'fixtures', id, 'brief.md'), 'utf8').trim());
});

for (const [id, patterns, fix] of cases) test(`composer selection CLI checks ${id} against expected.md`, t => {
  const directory = mkdtempSync(join(tmpdir(), 'rubato-composer-'));
  t.after(() => rmSync(directory, { recursive: true }));
  const outline = join(directory, 'outline.md');
  const selection = {
    barriers: [
      { id: 'b1', category: 'knowledge' },
      ...(fix ? [{ id: 'environment', category: 'environment' }] : []),
    ],
    patterns: patterns.map(pattern => ({ pattern, barriers: [pattern === 'written-task' || pattern === 'final-check' ? 'record' : 'b1'] })),
    outsideCourse: fix ? [{ barrier: 'environment', fix }] : [],
  };
  const run = value => {
    writeFileSync(outline, '# Selection\n\n```json\n' + JSON.stringify(value) + '\n```\n');
    const result = spawnSync(process.execPath, [join(assets, 'score-selection.mjs'), outline, join(assets, 'fixtures', id, 'expected.md')], { encoding: 'utf8', timeout: 10_000 });
    assert.ifError(result.error);
    assert.equal(result.stderr, '');
    return { status: result.status, ...JSON.parse(result.stdout) };
  };
  const passing = run(selection);
  assert.equal(passing.status, 0);
  assert.equal(passing.pass, true);
  assert.deepEqual(passing.chosen, patterns);

  const missing = run({ ...selection, patterns: [] });
  assert.equal(missing.status, 1);
  assert.equal(missing.pass, false);
  assert.ok(missing.missingRequired.length);

  const forbidden = run({ ...selection, patterns: [...selection.patterns, { pattern: 'test-out', barriers: ['b1'] }] });
  assert.equal(forbidden.status, 1);
  assert.deepEqual(forbidden.forbidden, ['test-out']);

  const outside = run({ ...selection, patterns: [...selection.patterns, { pattern: 'unknown-pattern', barriers: ['b1'] }] });
  assert.equal(outside.status, 1);
  assert.deepEqual(outside.outsideEnvelope, ['unknown-pattern']);

  const untraced = run({ ...selection, patterns: selection.patterns.map(p => ({ ...p, barriers: [] })) });
  assert.equal(untraced.status, 1);
  assert.deepEqual(untraced.untracedPatterns, patterns);

  const dangling = run({ ...selection, patterns: selection.patterns.map(p => ({ ...p, barriers: ['b1', 'does-not-exist'] })) });
  assert.equal(dangling.status, 1, 'Every reference must resolve, even alongside a valid reference');
  assert.deepEqual(dangling.untracedPatterns, patterns);

  const undeclared = run({ ...selection, barriers: [] });
  assert.equal(undeclared.status, 1, 'A nonempty reference list needs declared barriers');

  const invalidRecord = run({ ...selection, patterns: selection.patterns.map(p => ({ ...p, barriers: ['record'] })) });
  assert.equal(invalidRecord.status, 1, 'Only final-check and written-task may use record');
  assert.deepEqual(invalidRecord.untracedPatterns, patterns.filter(pattern => !['final-check', 'written-task'].includes(pattern)));

  // Outside-course entries must be real fixes even when this fixture requires none.
  for (const outsideCourse of [
    [{ barrier: 'does-not-exist', fix: 'Correct the display.' }],
    [{ barrier: 'b1', fix: 'Correct the display.' }],
  ]) {
    const invalidFix = run({ ...selection, outsideCourse });
    assert.equal(invalidFix.status, 1, 'A fix must reference a declared environment barrier');
    assert.equal(invalidFix.environmentFlagged, 0);
  }

  if (fix) {
    const absentFix = run({ ...selection, outsideCourse: [] });
    assert.equal(absentFix.status, 1);
    assert.equal(absentFix.environmentFlagged, 0);

    for (const empty of ['', '  \t ']) {
      const emptyFix = run({ ...selection, outsideCourse: [{ barrier: 'environment', fix: empty }] });
      assert.equal(emptyFix.status, 1, 'An environment fix must contain text');
      assert.equal(emptyFix.environmentFlagged, 0);
      const extraEmptyFix = run({ ...selection, outsideCourse: [...selection.outsideCourse, { barrier: 'environment', fix: empty }] });
      assert.equal(extraEmptyFix.status, 1, 'A valid fix must not hide an empty one');
    }
  }
});
