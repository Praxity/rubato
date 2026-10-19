import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { buildAdapters, installSkills } from '../src/skills.mjs';
import { fixture } from './helpers.mjs';

for (const [host, folder] of [['claude', '.claude/skills'], ['codex', '.agents/skills']]) {
  test(`installed ${host} assessment skill preserves the attack workflow and resolves its links`, t => {
    const { context } = fixture(t);
    const outputs = buildAdapters({ source: join(context.root, 'skills'), packVersion: context.pack.version });
    installSkills({ base: context.home, host, outputs });
    const path = join(context.home, folder, 'assessment-writing/SKILL.md');
    const skill = readFileSync(path, 'utf8');
    const commands = [...skill.matchAll(/^\s*(praxity trace [^\r\n]+)$/gm)].map(([, command]) => command);
    assert.deepEqual(commands, [
      'praxity trace report <course> --out <dir>',
      'praxity trace prepare item-cues <course> --out <bundle>',
      'praxity trace report <course> --out <dir> --item-cues <bundle>/answer.json',
    ]);
    assert.match(skill, /Spawn a fresh subagent for each probe/);
    assert.match(skill, /never seen the course source or the key/);
    assert.match(skill, /The writer never grades its own items/);
    assert.match(skill, /one-sided binomial p is above 0\.05/);
    assert.match(skill, /small banks, treat a flat percentage as noise/);
    assert.match(skill, /plausibility judgements as hints, never gates/);
    assert.match(skill, /If Trace's item-cues is not installed yet/);
    assert.match(skill, /run both probes by hand/);
    assert.match(skill, /Match the target exam's format/);
    assert.match(skill, /Set `\{shuffle\}` on scored choices/);
    assert.match(skill, /"I don't know" pinned last/);
    assert.match(skill, /"Don't know" sits in the submit control, not the option list/);
    assert.doesNotMatch(skill, /\b[A-Z]:[\\/]|\/Users\/|\/home\/|codex-runs|file:\/\//i);
    for (const [, href] of skill.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      if (/^https?:/.test(href)) continue;
      const target = href.split('#')[0];
      assert.ok(existsSync(resolve(dirname(path), target)), `Unresolved skill link: ${href}`);
    }
  });
}
