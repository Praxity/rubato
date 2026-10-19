import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { buildAdapters, installSkills } from '../src/skills.mjs';
import { fixture } from './helpers.mjs';

function assertAttackCommands(skill) {
  const commands = [...skill.matchAll(/^\s*(praxity (?:inspect|trace) [^\r\n]+)$/gm)].map(([, command]) => command);
  assert.equal(commands.length, 4);
  assert.equal(commands[0], 'praxity inspect <course-dir> --schema 1 > <inspect.json>');
  const input = commands[0].split(' > ')[1];
  assert.deepEqual(commands.slice(1), [
    `praxity trace report ${input} --out <dir>`,
    `praxity trace prepare item-cues ${input} --out <bundle>`,
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

const row = (count, p, pLow = 0.5) => ({ count, choicesOnly: { total: count, p, pLow } });

for (const [host, folder] of [['claude', '.claude/skills'], ['codex', '.agents/skills']]) {
  test(`installed ${host} assessment skill uses inspect JSON and gates banks plus the pooled course`, t => {
    const { context } = fixture(t);
    const outputs = buildAdapters({ source: join(context.root, 'skills'), packVersion: context.pack.version });
    installSkills({ base: context.home, host, outputs });
    const name = `${folder}/assessment-writing/SKILL.md`;
    const path = join(context.home, name);
    const skill = readFileSync(path, 'utf8');
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
    assert.equal(passes({ banks, course: row(32, 0.000000001) }), false, 'Small banks cannot mask the pooled leak');
    assert.equal(passes({ banks: [row(32, 0.5)], course: row(32, 0.05) }), false, 'The boundary does not pass');
    assert.equal(passes({ banks: [row(32, 0.01)], course: row(32, 0.5) }), false, 'A pooled pass cannot mask a bank leak');
    assert.equal(passes({ banks, course: row(32, 0.99, 0.01) }), false, 'A pooled anti-key fails');
    assert.equal(passes({ banks: [row(32, 0.99, 0.01)], course: row(32, 0.5) }), false, 'A bank anti-key fails');
    assert.equal(passes({ banks: [row(32, 0.5, 0.05)], course: row(32, 0.5, 0.05) }), true, 'The lower-tail boundary passes');
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
