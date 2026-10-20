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

test('composer requires a different model family for judging and fidelity review', () => {
  const skill = readFileSync(new URL('../skills/composer/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /judge and fidelity reviewer must be fresh agents[^\n]*from a different model family than the writer/);
  assert.match(skill, /When a fresh agent from a different model family can't run, keep the course a draft labelled "not independently reviewed"/);
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
