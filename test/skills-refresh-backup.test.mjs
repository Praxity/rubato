import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installSkills, refreshSkills, uninstallSkills } from '../src/skills.mjs';
import { fixture, repository } from './helpers.mjs';

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
      rmSync(join(context.home, '.praxity/toolkit-skills-digests.json'));
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

test('a save during installation is not recorded as packaged content', t => {
  const { context } = fixture(t), messages = [];
  const file = join(context.home, '.claude/skills/example/SKILL.md');
  const options = { base: context.home, home: context.home, host: 'claude', print: text => messages.push(text),
    outputs: { claude: new Map([['.claude/skills/example/SKILL.md', Buffer.from('Packaged')]]) } };
  const write = fs.writeFileSync;
  fs.writeFileSync = (path, ...args) => {
    write(path, ...args);
    if (path === file) write(file, 'Saved during installation');
  };
  syncBuiltinESMExports();
  try { installSkills(options); }
  finally { fs.writeFileSync = write; syncBuiltinESMExports(); }
  assert.equal(readFileSync(file, 'utf8'), 'Saved during installation');
  refreshSkills(options);
  const backup = messages.find(text => text.startsWith('Backed up example to '));
  assert.ok(backup);
  assert.equal(readFileSync(join(backup.slice('Backed up example to '.length), 'SKILL.md'), 'utf8'), 'Saved during installation');
  assert.equal(readFileSync(file, 'utf8'), 'Packaged');
});

for (const phase of ['after backup', 'without backup', 'during backup']) test(`a save ${phase} stops refresh before deleting originals`, t => {
  const { context } = fixture(t), messages = [];
  const file = join(context.home, '.claude/skills/example/SKILL.md');
  let save = false;
  const options = { base: context.home, home: context.home, host: 'claude',
    outputs: { claude: new Map([['.claude/skills/example/SKILL.md', Buffer.from('Packaged')]]) },
    print: text => {
      messages.push(text);
      if (save && text.startsWith('Backed up example to ')) writeFileSync(file, 'Latest save');
    } };
  installSkills(options);
  if (phase !== 'without backup') writeFileSync(file, 'Earlier save');
  save = phase === 'after backup';
  const copy = fs.cpSync, rename = fs.renameSync;
  fs.cpSync = (...args) => { copy(...args); if (phase === 'during backup') writeFileSync(file, 'Latest save'); };
  fs.renameSync = (...args) => {
    rename(...args);
    if (phase === 'without backup' && args[1] === join(context.home, '.praxity/toolkit-skills.json')) writeFileSync(file, 'Latest save');
  };
  syncBuiltinESMExports();
  try {
    assert.throws(() => refreshSkills(options), error => {
      assert.match(error.message, /A file changed during the refresh:/);
      assert.ok(error.message.includes(join(context.home, '.claude/skills/example')));
      assert.match(error.message, /Run the command again/);
      return true;
    });
  } finally { fs.cpSync = copy; fs.renameSync = rename; syncBuiltinESMExports(); }
  assert.equal(readFileSync(file, 'utf8'), 'Latest save');
  save = false;
  refreshSkills(options);
  assert.equal(readFileSync(file, 'utf8'), 'Packaged');
  const backups = messages.filter(text => text.startsWith('Backed up example to '));
  assert.ok(backups.some(text => readFileSync(join(text.slice('Backed up example to '.length), 'SKILL.md'), 'utf8') === 'Latest save'));
});

for (const sidecar of ['missing', 'invalid JSON', 'invalid schema']) test(`${sidecar} digest sidecar causes a conservative backup`, t => {
  const { context } = fixture(t), messages = [];
  const options = { base: context.home, home: context.home, host: 'claude', print: text => messages.push(text),
    outputs: { claude: new Map([['.claude/skills/example/SKILL.md', Buffer.from('Packaged')]]) } };
  installSkills(options);
  const path = join(context.home, '.praxity/toolkit-skills-digests.json');
  if (sidecar === 'missing') rmSync(path);
  else writeFileSync(path, sidecar === 'invalid JSON' ? '{broken' : '{"claude":{"example":42}}');
  refreshSkills(options);
  assert.ok(messages.some(text => text.startsWith('Backed up example to ')));
  messages.length = 0;
  refreshSkills(options);
  assert.deepEqual(messages, []);
});

test('ownership written by the new pack is readable by the previous pack', async t => {
  const { context } = fixture(t);
  const options = { base: context.home, home: context.home, host: 'claude', print() {},
    outputs: { claude: new Map([['.claude/skills/example/SKILL.md', Buffer.from('Packaged')]]) } };
  installSkills(options);
  refreshSkills(options);
  // Exact module, validator and schema snapshots from the rollback-supported pack.
  const previous = join(context.root, 'previous-pack');
  cpSync(join(repository, 'test/fixtures/skills-rollback-065d777'), previous, { recursive: true });
  const { validateSchema } = await import(pathToFileURL(join(previous, 'src/schema.mjs')));
  const oldSchema = JSON.parse(readFileSync(join(previous, 'schemas/skills-ownership.schema.json')));
  const ownership = JSON.parse(readFileSync(join(context.home, '.praxity/toolkit-skills.json')));
  assert.deepEqual(ownership, { owner: 'praxity-toolkit', hosts: ['claude'], skills: { claude: ['example'] } });
  assert.deepEqual(validateSchema(ownership, oldSchema), []);
  const old = await import(pathToFileURL(join(previous, 'src/skills.mjs')));
  assert.deepEqual(old.skillPresence(options).current, ['example']);
  old.refreshSkills(options);
  old.installSkills(options);
  old.uninstallSkills(options);
  assert.equal(existsSync(join(context.home, '.claude/skills/example')), false);
});

test('an interrupted install cannot reuse the previous baseline for a new save', t => {
  const { context } = fixture(t), messages = [];
  const file = join(context.home, '.claude/skills/example/SKILL.md');
  const options = { base: context.home, home: context.home, host: 'claude', print: text => messages.push(text),
    outputs: { claude: new Map([['.claude/skills/example/SKILL.md', Buffer.from('Old packaged content')]]) } };
  installSkills(options);
  options.outputs.claude.set('.claude/skills/example/SKILL.md', Buffer.from('New packaged content'));
  options.outputs.claude.set('.claude/skills/example/notes.txt', Buffer.from('New notes'));
  const write = fs.writeFileSync;
  fs.writeFileSync = (path, ...args) => {
    if (path === join(context.home, '.claude/skills/example/notes.txt')) throw Object.assign(new Error('Disk full'), { code: 'ENOSPC' });
    write(path, ...args);
    if (path === file) write(file, 'Old packaged content');
  };
  syncBuiltinESMExports();
  try { assert.throws(() => installSkills(options), { code: 'ENOSPC' }); }
  finally { fs.writeFileSync = write; syncBuiltinESMExports(); }
  // A save may restore the previous pack's bytes while the new install is interrupted.
  refreshSkills(options);
  const backup = messages.find(text => text.startsWith('Backed up example to '));
  assert.ok(backup);
  assert.equal(readFileSync(join(backup.slice('Backed up example to '.length), 'SKILL.md'), 'utf8'), 'Old packaged content');
  assert.equal(readFileSync(file, 'utf8'), 'New packaged content');
});

test('a save recreating a deleted skill stops refresh and survives retry', t => {
  const { context } = fixture(t), messages = [];
  const folder = join(context.home, '.claude/skills/a');
  const options = { base: context.home, home: context.home, host: 'claude', print: text => messages.push(text),
    outputs: { claude: new Map([
      ['.claude/skills/a/SKILL.md', Buffer.from('Packaged A')],
      ['.claude/skills/b/SKILL.md', Buffer.from('Packaged B')],
    ]) } };
  installSkills(options);
  const remove = fs.rmSync;
  fs.rmSync = (path, ...args) => {
    remove(path, ...args);
    if (path === folder) {
      mkdirSync(folder); writeFileSync(join(folder, 'SKILL.md'), 'Editor save after delete');
    }
  };
  syncBuiltinESMExports();
  try {
    assert.throws(() => refreshSkills(options), error => {
      assert.match(error.message, /A file changed during the refresh:/);
      assert.ok(error.message.includes(folder));
      assert.match(error.message, /Run the command again to restore any skills already removed/);
      return true;
    });
  } finally { fs.rmSync = remove; syncBuiltinESMExports(); }
  assert.equal(readFileSync(join(folder, 'SKILL.md'), 'utf8'), 'Editor save after delete');
  assert.equal(existsSync(join(context.home, '.claude/skills/b')), false);
  refreshSkills(options);
  const backup = messages.find(text => text.startsWith('Backed up a to '));
  assert.ok(backup);
  assert.equal(readFileSync(join(backup.slice('Backed up a to '.length), 'SKILL.md'), 'utf8'), 'Editor save after delete');
  assert.equal(readFileSync(join(folder, 'SKILL.md'), 'utf8'), 'Packaged A');
  assert.equal(readFileSync(join(context.home, '.claude/skills/b/SKILL.md'), 'utf8'), 'Packaged B');
});

for (const change of ['edited', 'unchanged', 'save after backup']) test(`uninstall protects ${change} skill contents`, t => {
  const { context } = fixture(t), messages = [];
  const folder = join(context.home, '.claude/skills/example'), file = join(folder, 'SKILL.md');
  let save = false;
  const options = { base: context.home, home: context.home, host: 'claude',
    outputs: { claude: new Map([['.claude/skills/example/SKILL.md', Buffer.from('Packaged')]]) },
    print: text => {
      messages.push(text);
      if (save && text.startsWith('Backed up example to ')) writeFileSync(file, 'Latest edit');
    } };
  installSkills(options);
  if (change !== 'unchanged') {
    writeFileSync(file, 'My edit'); writeFileSync(join(folder, 'notes.txt'), 'My notes');
  }
  if (change === 'save after backup') {
    save = true;
    assert.throws(() => uninstallSkills(options), /A file changed during the refresh:/);
    assert.equal(readFileSync(file, 'utf8'), 'Latest edit');
    assert.deepEqual(JSON.parse(readFileSync(join(context.home, '.praxity/toolkit-skills.json'))).skills, { claude: ['example'] });
    save = false;
  }
  uninstallSkills(options);
  assert.equal(existsSync(folder), false);
  const backups = messages.filter(text => text.startsWith('Backed up example to '));
  if (change === 'unchanged') assert.deepEqual(backups, []);
  else {
    const backup = backups.at(-1).slice('Backed up example to '.length);
    assert.equal(readFileSync(join(backup, 'SKILL.md'), 'utf8'), change === 'edited' ? 'My edit' : 'Latest edit');
    assert.equal(readFileSync(join(backup, 'notes.txt'), 'utf8'), 'My notes');
  }
  assert.deepEqual(JSON.parse(readFileSync(join(context.home, '.praxity/toolkit-skills.json'))).skills, {});
  assert.deepEqual(JSON.parse(readFileSync(join(context.home, '.praxity/toolkit-skills-digests.json'))), {});
});

for (const sidecar of ['missing', 'stale']) test(`re-upgrade backs up old-pack edits with a ${sidecar} sidecar`, async t => {
  const { context } = fixture(t), messages = [];
  const old = await import('./fixtures/skills-rollback-065d777/src/skills.mjs');
  const options = { base: context.home, home: context.home, host: 'claude', print: text => messages.push(text),
    outputs: { claude: new Map([['.claude/skills/example/SKILL.md', Buffer.from('Old packaged')]]) } };
  if (sidecar === 'stale') {
    installSkills(options);
    old.uninstallSkills(options);
  }
  old.installSkills(options);
  assert.equal(existsSync(join(context.home, '.praxity/toolkit-skills-digests.json')), sidecar === 'stale');
  const file = join(context.home, '.claude/skills/example/SKILL.md');
  writeFileSync(file, 'Edited while using old pack');
  options.outputs.claude.set('.claude/skills/example/SKILL.md', Buffer.from('New packaged'));
  refreshSkills(options);
  const backup = messages.find(text => text.startsWith('Backed up example to '));
  assert.ok(backup);
  assert.equal(readFileSync(join(backup.slice('Backed up example to '.length), 'SKILL.md'), 'utf8'), 'Edited while using old pack');
  assert.equal(readFileSync(file, 'utf8'), 'New packaged');
});
