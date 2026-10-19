import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { buildAdapters, installSkills } from '../src/skills.mjs';
import { fixture } from './helpers.mjs';

function assertAttackCommands(skill) {
  const commands = [...skill.matchAll(/^\s*(praxity (?:inspect|trace) [^\r\n]+)$/gm)].map(([, command]) => command);
  assert.equal(commands.length, 5);
  assert.equal(commands[0], 'praxity inspect <course-dir> --schema 1 > <inspect.json>');
  const input = commands[0].split(' > ')[1];
  assert.deepEqual(commands.slice(1), [
    `praxity trace report ${input} --out <dir>`,
    `praxity trace prepare item-cues ${input} --out <bundle>`,
    `praxity trace report ${input} --out <dir> --item-cues <bundle>/answer.json`,
    `praxity trace report ${input} --out <dir> --item-cues <bundle>/answer.json`,
  ]);
}

function assertPackLinks(skill, name, files) {
  for (const [, href] of skill.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    if (/^(?:https?:|#)/.test(href)) continue;
    const target = posix.normalize(posix.join(posix.dirname(name), href.split('#')[0]));
    assert.ok(files.has(target), `Link outside packaged skills or missing: ${href}`);
  }
}

function assertRefresh(skill) {
  const refresh = skill.split(/\r?\n\s*\r?\n/).find(paragraph => /After every rewrite/.test(paragraph));
  assert.ok(refresh, 'Each rewrite needs its own refresh instruction');
  assert.ok(refresh.indexOf('inspect') >= 0 && refresh.indexOf('inspect') < refresh.indexOf('prepare'), 'Inspect the rewritten source before preparing');
  assert.match(refresh, /new,?\s+empty bundle/);
  assert.match(refresh, /that pass's `answer\.json`.*that pass's inspect JSON/);
}

function assertPassCap(skill) {
  const attack = skill.split('## 3. Attack the bank')[1]?.split('### If item-cues')[0];
  assert.ok(attack);
  assert.match(attack, /at most (?:three|3) passes/);
  assert.match(attack, /After the third pass,[^\n]*stop for the person/);
  assert.match(attack, /Never re-run an unchanged bank/);
}

function assertJudge(skill) {
  const judge = skill.split(/\r?\n\s*\r?\n/).find(paragraph => paragraph.includes('`coverJudgement:'));
  assert.ok(judge, 'The independent judge must write the response labels');
  assert.match(judge, /separate fresh judge agent/);
  assert.match(judge, /neither wrote the items nor answered either probe/);
  const labels = [...judge.match(/`coverJudgement:([^`]+)`/)[1].matchAll(/"(\w+)"/g)].map(([, label]) => label).sort();
  assert.deepEqual(labels, ['alsoCorrect', 'cantTell', 'differs', 'matches']);
  assert.match(judge, /coverTheOptions\.judgeModel/);
  assert.match(judge, /`<bundle>\/judge-notes\.md`/);
  assert.match(judge, /per `differs` or `cantTell` item reference/);
  const reports = [...skill.matchAll(/^\s*praxity trace report [^\r\n]*--item-cues[^\r\n]*$/gm)];
  const judgeAt = skill.indexOf(judge);
  assert.ok(reports.length === 2 && reports[0].index < judgeAt && judgeAt < reports[1].index, 'Expose report rows before judging, then report the judgements');
  const alternative = skill.split(/\r?\n\s*\r?\n/).find(paragraph => paragraph.trimStart().startsWith('`alsoCorrect`'));
  assert.ok(alternative, 'A defensible alternative needs its own handling');
  assert.match(alternative, /"Another valid answer"/);
  assert.match(alternative, /stem lets more than one answer stand/);
  assert.match(alternative, /does not establish whether the offered options have a single best answer/);
  assert.match(alternative, /Either tighten the stem so only the key fits, or accept it as a best-answer item/);
  assert.match(alternative, /make the options settle which answer is best/);
}

const row = (count, p, pLow = 0.5) => ({ count, choicesOnly: { total: count, p, pLow } });

for (const [host, folder] of [['claude', '.claude/skills'], ['codex', '.agents/skills']]) {
  test(`installed ${host} assessment skill uses inspect JSON and gates banks plus the pooled course`, async t => {
    const { context } = fixture(t);
    const outputs = buildAdapters({ source: join(context.root, 'skills'), packVersion: context.pack.version });
    installSkills({ base: context.home, host, outputs });
    const name = `${folder}/assessment-writing/SKILL.md`;
    const path = join(context.home, name);
    const skill = readFileSync(path, 'utf8');
    await t.test('rewrites refresh inspect JSON and use a new empty bundle', () => {
      assertRefresh(skill);
      const stripped = skill.replace(/   After every rewrite,[\s\S]*?(?=\r?\n\r?\n)/, '   After every rewrite, regenerate the bundle and repeat.');
      assert.notEqual(stripped, skill);
      assert.throws(() => assertRefresh(stripped));
    });
    await t.test('rewrites have a finite three-pass cap and escalation', () => {
      assertPassCap(skill);
      const stripped = skill.replace(/Run at most (?:three|3) passes\./, '');
      assert.notEqual(stripped, skill);
      assert.throws(() => assertPassCap(stripped));
    });
    await t.test('a separate judge supplies all supported labels and its actual model', () => {
      assertJudge(skill);
      const stripped = skill.replace(/[^\n]*`coverJudgement:[^\n]*(?:\n|$)/, '');
      assert.notEqual(stripped, skill);
      assert.throws(() => assertJudge(stripped));
    });
    assertAttackCommands(skill);
    assert.throws(() => assertAttackCommands(skill.replace(/^\s*praxity inspect .+\n/m, '')));
    assert.throws(() => assertAttackCommands(skill.replace('trace prepare item-cues <inspect.json>', 'trace prepare item-cues <course-dir>')));
    assert.throws(() => assertAttackCommands(skill.replace('> <inspect.json>', '> <stale.json>')));

    // Execute the shipped predicate with report-shaped data, rather than pinning its prose.
    const predicate = skill.match(/```js\r?\n([\s\S]*?)```/)?.[1];
    assert.ok(predicate, 'The statistical gate must be executable');
    const passes = runInNewContext(`${predicate}\nchoicesOnlyPass`);
    const banks = Array.from({ length: 8 }, () => row(4, 0.05078125));
    assert.equal(passes({ banks, course: row(32, 0.5) }), true);
    assert.equal(passes({ banks: [row(3, 0.015625, 1), row(29, 0.5)], course: row(32, 0.5) }), true, 'Three of three in a small bank is read through the clean course');
    assert.equal(passes({ banks, course: row(32, 0.000000001) }), false, 'Small banks cannot mask the pooled leak');
    assert.equal(passes({ banks: [row(32, 0.5)], course: row(32, 0.025) }), false, 'The course upper-tail boundary does not pass');
    assert.equal(passes({ banks: [row(32, 0.01)], course: row(32, 0.5) }), false, 'A pooled pass cannot mask a bank leak');
    assert.equal(passes({ banks, course: row(32, 0.99, 0.01) }), false, 'A pooled anti-key fails');
    assert.equal(passes({ banks: [row(32, 0.99, 0.01)], course: row(32, 0.5) }), false, 'A bank anti-key fails');
    assert.equal(passes({ banks: [row(32, 0.5)], course: row(32, 0.5, 0.025) }), false, 'The course lower-tail boundary does not pass');
    const largeBanks = Array.from({ length: 5 }, () => row(12, 0.006, 0.006));
    assert.equal(passes({ banks: largeBanks, course: row(60, 0.5) }), true, 'Five large banks use 0.005 per tail');
    assert.equal(passes({ banks: [row(12, 0.005), ...largeBanks.slice(1)], course: row(60, 0.5) }), false);
    assert.equal(passes({ banks: [row(12, 0.5, 0.005), ...largeBanks.slice(1)], course: row(60, 0.5) }), false);
    const noLowerTail = row(32, 0.5); delete noLowerTail.choicesOnly.pLow;
    assert.equal(passes({ banks: [noLowerTail], course: row(32, 0.5) }), false, 'An older report with no lower tail cannot pass');
    for (const report of [undefined, {}, { banks }, { banks: [], course: row(0, 1) }, { banks, course: row(31, 0.5) }]) {
      assert.equal(passes(report), false, 'Missing, empty or mismatched totals cannot pass');
    }
    const incomplete = row(32, 0.5); incomplete.choicesOnly.total = 31;
    assert.equal(passes({ banks: [incomplete], course: row(32, 0.5) }), false);

    assert.doesNotMatch(skill, /\b[A-Z]:[\\/]|\/Users\/|\/home\/|file:\/\//i);
    assert.match(skill, /fresh subagent.*never seen.*course source.*key/);
    const explanation = skill.match(/^## Explaining a wrong answer\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1];
    assert.ok(explanation, 'The installed skill must teach wrong-answer explanations');
    const examples = [...explanation.matchAll(/```prax\r?\n([\s\S]*?)```/g)].map(([, text]) => text);
    assert.ok(examples.length > 0, 'Keep a learner-facing example');
    assert.doesNotMatch(explanation, /\bbeliefs?\b/i);
    for (const text of examples) {
      assert.ok(text.includes('feedback:'), 'The current contrast belongs in supported option feedback');
      assert.doesNotMatch(text, /rightWhen\s*[:=]|confidence\s*[:=]/, 'Planned fields have no example syntax');
    }
    const worked = examples[0];
    const counts = worked.match(/Four crates hold ([\d, and]+) jars/)[1].match(/\d+/g).map(Number);
    assert.deepEqual(counts, [2, 3, 4, 7]);
    const total = counts.reduce((sum, count) => sum + count, 0);
    assert.equal(total, 16);
    assert.equal(total / counts.length, 4);
    assert.equal(total / 1, 16);
    assert.match(worked, /^\(x\) 4 jars per crate$/m);
    assert.match(worked, /^\( \) 16 jars per crate$/m);
    assert.match(worked, /Sixteen would be the mean if there were only one crate\./);
    assertPackLinks(skill, name, outputs[host]);
    for (const [, href] of skill.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      if (/^(?:https?:|#)/.test(href)) continue;
      assert.ok(existsSync(resolve(dirname(path), href.split('#')[0])));
    }
    assertPackLinks('[Sibling](../studio-editor/SKILL.md)', name, outputs[host]);
    const escape = '../../../.praxity/toolkit-skills.json';
    assert.ok(existsSync(resolve(dirname(path), escape)), 'The escaping link targets a real file');
    assert.throws(() => assertPackLinks(`[Outside](${escape})`, name, outputs[host]), /outside packaged skills/);
  });
}
