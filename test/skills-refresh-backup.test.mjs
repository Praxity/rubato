import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { installSkills, refreshSkills } from '../src/skills.mjs';
import { fixture } from './helpers.mjs';

for (const change of ['edited', 'added', 'deleted', 'unchanged', 'legacy']) {
  test(`refresh preserves ${change} skill contents before installing new content`, t => {
    const { context } = fixture(t), messages = [];
    const folder = join(context.home, '.claude/skills/example');
    const outputs = { claude: new Map([
      ['.claude/skills/example/SKILL.md', Buffer.from('Original')],
      ['.claude/skills/example/notes.txt', Buffer.from('Original notes')],
    ]) };
    const options = { base: context.home, home: context.home, outputs, print: text => messages.push(text) };
    installSkills({ ...options, host: 'claude' });
    if (change === 'edited') writeFileSync(join(folder, 'SKILL.md'), 'My edits');
    if (change === 'added') writeFileSync(join(folder, 'extra.txt'), 'My notes');
    if (change === 'deleted') rmSync(join(folder, 'notes.txt'));
    if (change === 'legacy') {
      const record = join(context.home, '.praxity/toolkit-skills.json');
      const state = JSON.parse(readFileSync(record)); delete state.digests;
      writeFileSync(record, JSON.stringify(state));
    }
    outputs.claude.set('.claude/skills/example/SKILL.md', Buffer.from('New packaged skill'));
    // Exercise both entry points; compare against the recorded install, not the new pack.
    if (change === 'edited') installSkills({ ...options, host: 'claude' });
    else refreshSkills(options);
    assert.equal(readFileSync(join(folder, 'SKILL.md'), 'utf8'), 'New packaged skill');
    const message = messages.find(text => text.startsWith('Backed up example to '));
    if (change === 'unchanged') {
      assert.equal(message, undefined);
      assert.equal(existsSync(join(context.home, '.praxity/skill-backups')), false);
    } else {
      assert.ok(message, 'Local contents must be backed up');
      const backup = message.slice('Backed up example to '.length);
      assert.equal(readFileSync(join(backup, 'SKILL.md'), 'utf8'), change === 'edited' ? 'My edits' : 'Original');
      if (change === 'added') assert.equal(readFileSync(join(backup, 'extra.txt'), 'utf8'), 'My notes');
      if (change === 'deleted') assert.equal(existsSync(join(backup, 'notes.txt')), false);
    }
    messages.length = 0;
    installSkills({ ...options, host: 'claude' });
    assert.deepEqual(messages, []);
  });
}

test('a failed refresh backup leaves the edited folder and ownership intact', t => {
  const { context } = fixture(t);
  const options = { base: context.home, home: context.home, host: 'claude',
    outputs: { claude: new Map([['.claude/skills/example/SKILL.md', Buffer.from('Original')]]) }, print() {} };
  installSkills(options);
  const file = join(context.home, '.claude/skills/example/SKILL.md');
  const record = join(context.home, '.praxity/toolkit-skills.json');
  writeFileSync(file, 'My edits');
  const before = readFileSync(record);
  const copy = fs.cpSync;
  fs.cpSync = () => { throw Object.assign(new Error('Backup disk full'), { code: 'ENOSPC' }); };
  syncBuiltinESMExports();
  try {
    assert.throws(() => installSkills(options), { code: 'ENOSPC' });
  } finally { fs.cpSync = copy; syncBuiltinESMExports(); }
  assert.equal(readFileSync(file, 'utf8'), 'My edits');
  assert.deepEqual(readFileSync(record), before);
});
