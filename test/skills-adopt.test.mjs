import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { runCli } from '../src/cli.mjs';
import { buildAdapters, installSkills } from '../src/skills.mjs';
import { fixture } from './helpers.mjs';

function unowned(context, root, name = 'composer') {
  const folder = join(context.home, root, name);
  mkdirSync(join(folder, 'references'), { recursive: true });
  writeFileSync(join(folder, 'SKILL.md'), 'My old skill\n');
  writeFileSync(join(folder, 'references/notes.txt'), 'Keep my notes\n');
  return folder;
}

for (const [host, root] of [['claude', '.claude/skills'], ['codex', '.agents/skills']]) {
  test(`${host}: plain install refuses unowned skills and explains adoption`, async t => {
    const { context } = fixture(t);
    const folder = unowned(context, root);
    await assert.rejects(runCli(['skills', 'install', '--host', host, '--scope', 'user'], context), {
      message: `Unowned skill folder: ${folder}; refusing overwrite. Run the install with --adopt to review file differences, then --adopt --yes to back up and replace.`,
    });
    assert.equal(readFileSync(join(folder, 'SKILL.md'), 'utf8'), 'My old skill\n');
    assert.equal(existsSync(join(context.home, '.praxity')), false);
  });

  test(`${host}: adopt preview lists differences and leaves all folders and ownership unchanged`, async t => {
    const { context } = fixture(t);
    const folder = unowned(context, root);
    const second = unowned(context, root, 'studio-editor');
    const packaged = buildAdapters({ source: join(context.root, 'skills') })[host];
    writeFileSync(join(folder, 'references/unchanged.txt'), 'Same\n');
    mkdirSync(join(context.root, 'skills/composer/references'), { recursive: true });
    writeFileSync(join(context.root, 'skills/composer/references/unchanged.txt'), 'Same\n');
    const messages = [];
    await assert.rejects(runCli(['skills', 'install', '--host', host, '--scope', 'user', '--adopt'], context, { print: text => messages.push(text) }), {
      message: 'Adoption preview only; no files changed. Review the differences, then rerun with --adopt --yes to back up and replace.',
    });
    const output = messages.join('\n');
    assert.ok(output.includes(`Adopt composer: ${folder}\nFile differences (existing -> packaged):`));
    assert.ok(output.includes(`Adopt studio-editor: ${second}`));
    assert.match(output, /changed SKILL\.md: existing 13 bytes, sha256 [a-f0-9]{12}; packaged \d+ bytes, sha256 [a-f0-9]{12}/);
    assert.ok(output.includes('existing only references/notes.txt: 14 bytes (preserved in backup)'));
    assert.ok(output.includes('unchanged references/unchanged.txt: 5 bytes'));
    const added = [...packaged.keys()].find(name => name.startsWith(`${root}/composer/`) && !name.endsWith('/SKILL.md'));
    assert.ok(added, 'The packaged composer includes reference files');
    assert.ok(output.includes(`packaged only ${added.slice(`${root}/composer/`.length)}:`));
    assert.equal(readFileSync(join(folder, 'SKILL.md'), 'utf8'), 'My old skill\n');
    assert.equal(readFileSync(join(folder, 'references/notes.txt'), 'utf8'), 'Keep my notes\n');
    assert.equal(readFileSync(join(second, 'SKILL.md'), 'utf8'), 'My old skill\n');
    assert.deepEqual(readdirSync(join(context.home, root)), ['composer', 'studio-editor']);
    assert.equal(existsSync(join(context.home, '.praxity')), false);
  });

  test(`${host}: confirmed adoption backs up shipped names, records ownership and supports plain reinstalls`, async t => {
    const { context } = fixture(t);
    const folder = unowned(context, root);
    const other = unowned(context, root, 'my-personal-skill');
    const messages = [];
    const command = ['skills', 'install', '--host', host, '--scope', 'user'];
    assert.equal(await runCli([...command, '--adopt', '--yes'], context, { print: text => messages.push(text) }), 0);
    const backupMessage = messages.find(text => text.startsWith('Backed up composer to '));
    assert.ok(backupMessage);
    const backup = backupMessage.slice('Backed up composer to '.length);
    assert.match(relative(context.home, backup).replaceAll('\\', '/'), new RegExp(`^\\.praxity/skill-backups/${host}/composer-\\d{4}-\\d{2}-\\d{2}T[\\d-]+Z-[^/]+/composer$`));
    assert.equal(readFileSync(join(backup, 'SKILL.md'), 'utf8'), 'My old skill\n');
    assert.equal(readFileSync(join(backup, 'references/notes.txt'), 'utf8'), 'Keep my notes\n');
    assert.ok(messages.indexOf(backupMessage) > messages.findIndex(text => text.startsWith('Adopt composer:')));
    const expected = buildAdapters({ source: join(context.root, 'skills') })[host];
    assert.deepEqual(readFileSync(join(folder, 'SKILL.md')), expected.get(`${root}/composer/SKILL.md`));
    assert.equal(existsSync(join(folder, 'references/notes.txt')), false);
    const state = JSON.parse(readFileSync(join(context.home, '.praxity/toolkit-skills.json'), 'utf8'));
    assert.deepEqual(state, { owner: 'praxity-toolkit', hosts: [host], skills: { [host]: ['assessment-writing', 'composer', 'install-praxity', 'studio-editor'] } });
    assert.equal(await runCli(command, context, { print() {} }), 0);
    assert.equal(readFileSync(join(backup, 'SKILL.md'), 'utf8'), 'My old skill\n');
    assert.equal(readFileSync(join(other, 'SKILL.md'), 'utf8'), 'My old skill\n');
    assert.equal(readFileSync(join(other, 'references/notes.txt'), 'utf8'), 'Keep my notes\n');
    assert.deepEqual(readdirSync(join(context.home, '.praxity/skill-backups', host)).length, 1);
  });
}

test('preview preserves an existing ownership record and edited owned skills', async t => {
  const { context } = fixture(t);
  const command = ['skills', 'install', '--host', 'claude', '--scope', 'user'];
  await runCli(command, context, { print() {} });
  const record = join(context.home, '.praxity/toolkit-skills.json');
  const state = JSON.parse(readFileSync(record, 'utf8'));
  state.skills.claude = state.skills.claude.filter(name => name !== 'composer');
  writeFileSync(record, JSON.stringify(state));
  const before = readFileSync(record);
  const owned = join(context.home, '.claude/skills/studio-editor/SKILL.md');
  writeFileSync(owned, 'Edited owned skill');
  await assert.rejects(runCli([...command, '--adopt'], context, { print() {} }), /Adoption preview only/);
  assert.deepEqual(readFileSync(record), before);
  assert.equal(readFileSync(owned, 'utf8'), 'Edited owned skill');
  // Existing ownership is by folder name: a plain reinstall still replaces edits.
  await runCli([...command, '--adopt', '--yes'], context, { print() {} });
  assert.deepEqual(readFileSync(owned), buildAdapters({ source: join(context.root, 'skills') }).claude.get('.claude/skills/studio-editor/SKILL.md'));
  assert.equal(readdirSync(join(context.home, '.praxity/skill-backups/claude')).every(name => name.startsWith('composer-')), true);
});

test('adoption preflights the competing scope before creating backups or ownership', async t => {
  const { context } = fixture(t);
  const folder = unowned(context, '.claude/skills');
  const competing = join(context.cwd, '.claude/skills/studio-editor');
  mkdirSync(competing, { recursive: true }); writeFileSync(join(competing, 'SKILL.md'), 'Competing skill');
  await assert.rejects(runCli(['skills', 'install', '--host', 'claude', '--scope', 'user', '--adopt', '--yes'], context), /Competing skill in the other scope/);
  assert.equal(readFileSync(join(folder, 'SKILL.md'), 'utf8'), 'My old skill\n');
  assert.equal(existsSync(join(context.home, '.praxity')), false);
});

test('adoption refuses nested symlinks before changing any skill', async t => {
  const { context } = fixture(t);
  const folder = unowned(context, '.claude/skills');
  const second = unowned(context, '.claude/skills', 'studio-editor');
  const outside = join(context.root, 'outside'); mkdirSync(outside); writeFileSync(join(outside, 'notes.txt'), 'Outside');
  symlinkSync(outside, join(second, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(runCli(['skills', 'install', '--host', 'claude', '--scope', 'user', '--adopt', '--yes'], context, { print() {} }), /Skill symlink refused/);
  assert.equal(readFileSync(join(folder, 'SKILL.md'), 'utf8'), 'My old skill\n');
  assert.equal(readFileSync(join(outside, 'notes.txt'), 'utf8'), 'Outside');
  assert.equal(existsSync(join(context.home, '.praxity')), false);
});

test('adoption refuses a symlinked backup root without moving originals', async t => {
  const { context } = fixture(t);
  const folder = unowned(context, '.claude/skills');
  const outside = join(context.root, 'outside'); mkdirSync(outside);
  mkdirSync(join(context.home, '.praxity'));
  symlinkSync(outside, join(context.home, '.praxity/skill-backups'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(runCli(['skills', 'install', '--host', 'claude', '--scope', 'user', '--adopt', '--yes'], context, { print() {} }), /Adapter symlink refused/);
  assert.equal(readFileSync(join(folder, 'SKILL.md'), 'utf8'), 'My old skill\n');
  assert.deepEqual(readdirSync(outside), []);
  assert.equal(existsSync(join(context.home, '.praxity/toolkit-skills.json')), false);
});

test('T3 alias adopts at project scope while leaving user scope untouched', async t => {
  const { context } = fixture(t);
  const folder = join(context.cwd, '.claude/skills/composer');
  mkdirSync(folder, { recursive: true }); writeFileSync(join(folder, 'SKILL.md'), 'Old project skill');
  assert.equal(await runCli(['skills', 'install', '--host', 't3', '--scope', 'project', '--adopt', '--yes'], context, { print() {} }), 0);
  assert.deepEqual(JSON.parse(readFileSync(join(context.cwd, '.praxity/toolkit-skills.json'), 'utf8')).hosts, ['claude']);
  assert.equal(readdirSync(join(context.cwd, '.praxity/skill-backups/claude')).length, 1);
  assert.deepEqual(readdirSync(context.home), []);
});

test('adopt without confirmation is read only even when no unowned folders exist', async t => {
  const { context } = fixture(t), messages = [];
  await assert.rejects(runCli(['skills', 'install', '--host', 'claude', '--scope', 'user', '--adopt'], context, { print: text => messages.push(text) }), /Adoption preview only/);
  assert.deepEqual(messages, ['No unowned skill folders to adopt.']);
  assert.deepEqual(readdirSync(context.home), []);
});

test('a copy failure after adoption keeps the backup and names for a plain retry', t => {
  const { context } = fixture(t);
  unowned(context, '.claude/skills');
  const outputs = { claude: new Map([
    ['.claude/skills/composer/SKILL.md', Buffer.from('Fresh skill\n')],
    ['.claude/skills/studio-editor/SKILL.md', null],
  ]) };
  const messages = [];
  const options = { base: context.home, host: 'claude', outputs };
  assert.throws(() => installSkills({ ...options, adopt: true, yes: true, print: text => messages.push(text) }), { code: 'ERR_INVALID_ARG_TYPE' });
  const backup = messages.find(text => text.startsWith('Backed up composer to ')).slice('Backed up composer to '.length);
  assert.equal(readFileSync(join(backup, 'SKILL.md'), 'utf8'), 'My old skill\n');
  assert.deepEqual(JSON.parse(readFileSync(join(context.home, '.praxity/toolkit-skills.json'), 'utf8')).skills, { claude: ['composer', 'studio-editor'] });
  outputs.claude.set('.claude/skills/studio-editor/SKILL.md', Buffer.from('Fresh editor\n'));
  installSkills(options);
  assert.equal(readFileSync(join(context.home, '.claude/skills/studio-editor/SKILL.md'), 'utf8'), 'Fresh editor\n');
  assert.equal(readFileSync(join(backup, 'references/notes.txt'), 'utf8'), 'Keep my notes\n');
});

for (const args of [['install', '--yes'], ['uninstall', '--adopt'], ['refresh', '--adopt']]) test(`invalid adoption flags: ${args.join(' ')}`, async t => {
  const { context } = fixture(t);
  const [operation, flag] = args;
  await assert.rejects(runCli(['skills', operation, '--scope', 'user', ...(operation === 'refresh' ? [] : ['--host', 'claude']), flag], context), /Only skills install accepts --adopt; --yes requires --adopt/);
  assert.equal(existsSync(join(context.home, '.praxity')), false);
});
