import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, unlinkSync } from 'node:fs';
import { join, posix } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildAdapters, installSkills, uninstallSkills } from '../src/skills.mjs';
import { runCli } from '../src/cli.mjs';
import { doctor } from '../src/doctor.mjs';
import { courseActions } from '../src/t3-actions.mjs';
import { initCourse } from '../src/init.mjs';
import { fixture, fakeTool, repository } from './helpers.mjs';

const outputsFor = context => buildAdapters({ source: join(context.root, 'skills') });
const readState = base => JSON.parse(readFileSync(join(base, '.praxity/toolkit-skills.json'), 'utf8'));

function assertExportProcedure(text, name) {
  const lines = text.split('\n');
  let previousExport = 0, exports = 0;
  for (const [index, line] of lines.entries()) {
    if (!/\bExport (?:HTML|PDF|a course|the course)\b/i.test(line)) continue;
    exports++;
    assert.match(lines.slice(previousExport, index).join('\n'), /Before every export, run `~\/\.praxity\/bin\/praxity identity init <course-folder>`/, `${name}: initialize identity before each export without flags`);
    previousExport = index + 1;
  }
  return exports;
}

// The prax-format skill owns the identity rule, including when rederivation is allowed.
// Rubato skills run init before each Studio or export command and point to that rule.
const identityRule = "follow the prax-format skill's identity rule";
const readStudioWorkflow = () => readFileSync(join(repository, 'skills/studio-editor/SKILL.md'), 'utf8') + '\n' + readFileSync(join(repository, 'skills/studio-editor/references/review-cli.md'), 'utf8');
const studioStopRule = "If init reports anything other than `ok: true`, stop: don't open Studio, and follow the prax-format skill's identity rule.";

function praxityCommands(code) {
  // Match the launcher suffix so paths, variables, npx and shell chains share a detector.
  return [...code.matchAll(/(?<![\w.-])praxity["']?\s+(identity\s+init|studio|export)\b([^\r\n;&|]*)/g)].map(([, operation, tail]) => ({
    operation: operation.replace(/\s+/g, ' '),
    args: tail.match(/"[^"]*"|'[^']*'|<[^>]*>|[^\s]+/g) ?? [],
  }));
}

function assertCommandProcedures(text, name) {
  const counts = { studio: 0, export: 0 }, sectionInitialized = new Set();
  let previousEnd = 0;
  for (const snippet of text.matchAll(/^[\t ]*(?<fence>`{3,}|~{3,})[^\n]*\n(?<block>[\s\S]*?)^[\t ]*\k<fence>[\t ]*\r?$|(?<ticks>`+)(?<inline>[\s\S]*?)\k<ticks>/gm)) {
    if (/^#{1,6}\s+/m.test(text.slice(previousEnd, snippet.index))) sectionInitialized.clear();
    previousEnd = snippet.index + snippet[0].length;
    const { block, inline } = snippet.groups;
    const code = block ?? inline;
    // Prose spans may use an earlier instruction in their section; blocks and chains stand alone.
    const initialized = block !== undefined || /&&|;|\n/.test(code) ? new Set() : sectionInitialized;
    for (const { operation, args } of praxityCommands(code)) {
      if (operation === 'studio' && args.length === 1 && args[0] === '--help') continue;
      const course = args[0]?.replace(/^(?:"(.*)"|'(.*)')$/, '$1$2');
      if (operation === 'identity init') {
        if (course && !course.startsWith('-') && args.length === 1) initialized.add(course);
      } else {
        counts[operation]++;
        assert.ok(course && !course.startsWith('-') && initialized.has(course), `${name}: initialize the same course before each ${operation} command without flags`);
        initialized.delete(course);
      }
    }
  }
  if (counts.studio) assert.ok(text.replace(/\s+/g, ' ').includes(studioStopRule), `${name}: stop when identity is blocked`);
  return counts;
}

function assertRederivationRule(text, required = false) {
  const normalized = text.replace(/\s+/g, ' ');
  if (required) assert.ok(normalized.includes(identityRule), 'point to the identity rule its owner documents');
  assert.ok(!normalized.includes('--rederive'), 'only the prax-format skill may mention --rederive');
}

test('every course export procedure initializes identity first without flags', () => {
  const outputs = buildAdapters({ source: join(repository, 'skills') });
  let exports = 0;
  for (const [name, bytes] of outputs.codex) {
    if (!name.endsWith('.md')) continue;
    exports += assertExportProcedure(bytes.toString(), name);
  }
  assert.equal(exports, 1, 'pin the prose export procedure inventory');
});

test('skills that initialize identity defer rederivation to the prax-format identity rule', () => {
  const outputs = buildAdapters({ source: join(repository, 'skills') });
  for (const [name, bytes] of outputs.codex) {
    if (!name.endsWith('.md')) continue;
    assertRederivationRule(bytes.toString(), bytes.toString().includes('praxity identity init'));
  }
});

test('every Studio and export command initializes the same course first, with pinned invocation totals', () => {
  const outputs = buildAdapters({ source: join(repository, 'skills') });
  const totals = { studio: 0, export: 0 };
  for (const [name, bytes] of outputs.codex) {
    if (!name.endsWith('.md')) continue;
    // Resolve the lifecycle's identity pointer before checking all three launch examples.
    if (name.endsWith('/studio-editor/references/review-cli.md')) continue;
    const document = name.endsWith('/studio-editor/SKILL.md') ? readStudioWorkflow() : bytes.toString();
    const counts = assertCommandProcedures(document, name);
    totals.studio += counts.studio;
    totals.export += counts.export;
  }
  assert.deepEqual(totals, { studio: 3, export: 0 });
});

test('Studio guards reject missing, late or mismatched initialization and missing stop instructions', () => {
  const skill = readStudioWorkflow();
  const init = '~/.praxity/bin/praxity identity init .\n';
  assert.ok(skill.includes(init));
  const withoutInit = skill.replace(init, '');
  assert.throws(() => assertCommandProcedures(withoutInit));
  assert.throws(() => assertCommandProcedures(withoutInit.replace('~/.praxity/bin/praxity studio . --no-open', `~/.praxity/bin/praxity studio . --no-open\n${init}`)));
  assert.throws(() => assertCommandProcedures(skill.replace(init, init.replace('init .', 'init ./other-course'))));
  assert.notEqual(skill.replace(/If init reports anything other[\s\S]*?identity rule\./, ''), skill);
  assert.throws(() => assertCommandProcedures(skill.replace(/If init reports anything other[\s\S]*?identity rule\./, '')));
  assert.throws(() => assertCommandProcedures(skill.replace(init, init.replace('init .', 'init . --yes'))));
  assert.throws(() => assertCommandProcedures(skill.replace('~/.praxity/bin/praxity studio . --no-open', '~/.praxity/bin/praxity studio . --no-open\n~/.praxity/bin/praxity studio . --no-open')));
  assert.throws(() => assertCommandProcedures(`${skill}\n\`\`\`sh\n  $ praxity studio ./other-course\n\`\`\``));
  assert.match(skill.replace(/\s+/g, ' '), /stop the old process\. Run identity init, then launch again,/);
});

function assertReviewLaunch(section) {
  const text = section.replace(/\s+/g, ' ');
  assert.ok(text.includes("Before every open or restart, follow Open Studio's identity initialization step and follow the prax-format skill's identity rule."), 'review launch follows the exact identity stop rule');
  assert.doesNotMatch(text, /\b(?:exempt|exception|does not apply|may skip|can skip|skip identity|skip initialization|without identity|bypass|ignore (?:the )?(?:identity|stop))\b/i, 'review launches have no identity exemption');
}

function assertReservedReviewPort(section) {
  const text = section.replace(/\s+/g, ' ');
  assert.match(text, /course root's `t3\.json`/);
  assert.match(text, /`scripts\[\]` entry named `Open in Studio`/);
  assert.match(text, /`command`.*executable `praxity` or `"\$HOME\/\.praxity\/bin\/praxity"`, followed by `studio \. --port N` and optionally `--no-open`, with no other arguments/);
  assert.match(text, /Copy only the decimal port/);
  assert.match(text, /never invent a port/i);
  assert.match(text, /Without a reservation, unsent drafts do not survive a Studio restart\./);
  assert.ok(section.includes('~/.praxity/bin/praxity identity init .\n~/.praxity/bin/praxity studio . --review --port N --no-open'), 'review launch uses the reserved port after identity init');
  assert.ok(section.includes('~/.praxity/bin/praxity identity init .\n~/.praxity/bin/praxity studio . --review --no-open'), 'unreserved review launch omits the port after identity init');
}

test('review launch takes its port from the reserved Studio action in every adapter', () => {
  const outputs = buildAdapters({ source: join(repository, 'skills') });
  for (const [host, files] of Object.entries(outputs)) {
    const skill = [...files].filter(([name]) => /studio-editor\/(?:SKILL\.md|references\/review-cli\.md)$/.test(name)).map(([, bytes]) => bytes.toString()).join('\n');
    const section = skill.split('## Open for review\n')[1].split('\n## ')[0];
    assertReservedReviewPort(section);
    assertReviewLaunch(section);
    assert.equal(assertCommandProcedures(skill, host).studio, 3);
    // Both reservation branches must independently initialize the course.
    for (const launch of ['--review --port N --no-open', '--review --no-open']) {
      const commands = `~/.praxity/bin/praxity identity init .\n~/.praxity/bin/praxity studio . ${launch}`;
      assert.throws(() => assertCommandProcedures(skill.replace(commands, commands.split('\n')[1]), host), /initialize the same course/);
    }
  }
});

test('review port guard rejects an omitted or invented reserved port', () => {
  const skill = readStudioWorkflow();
  const section = skill.split('## Open for review\n')[1].split('\n## ')[0];
  assertReservedReviewPort(section);
  for (const replacement of ['--review --no-open', '--review --port 4311 --no-open']) {
    assert.throws(() => assertReservedReviewPort(section.replace('--review --port N --no-open', replacement)), /uses the reserved port/);
  }
});

test('documented reserved-port forms round trip generated actions and the init matcher', t => {
  const skill = readStudioWorkflow();
  const section = skill.split('## Open for review\n')[1].split('\n## ')[0];
  assertReservedReviewPort(section);
  const form = section.match(/`(studio \. --port N)`/)[1];
  const action = courseActions(4311).find(action => action.name === 'Open in Studio');
  assert.equal(action.command, `"$HOME/.praxity/bin/praxity" ${form.replace('N', '4311')} --no-open`);
  for (const launcher of ['praxity', '"$HOME/.praxity/bin/praxity"']) {
    const command = action.command.replace('"$HOME/.praxity/bin/praxity"', launcher);
    assert.equal(Number(command.match(/ --port (\d+)(?: --no-open)?$/)[1]), 4311);
    // Exercise studioCommand through init's public interface, using a port in its reservation range.
    const { context } = fixture(t);
    writeFileSync(join(context.cwd, 'course.yaml'), 'title: A course\n');
    writeFileSync(join(context.cwd, 't3.json'), JSON.stringify({ scripts: [{ name: action.name, command: command.replace('4311', '41811') }] }));
    assert.equal(initCourse({ folder: context.cwd, home: context.home }).port, 41811);
    const saved = JSON.parse(readFileSync(join(context.cwd, 't3.json'), 'utf8')).scripts.find(script => script.name === action.name);
    assert.equal(Number(saved.command.match(/ --port (\d+)(?: --no-open)?$/)[1]), 41811);
  }
});

test('busy review reservation reports the collision and requires consent before dropping the port', () => {
  const skill = readStudioWorkflow();
  const section = skill.split('## Open for review\n')[1].split('\n## ')[0].replace(/\s+/g, ' ');
  assert.match(section, /reserved port is busy, report Studio's message/);
  assert.match(section, /Never stop another course's Studio/);
  assert.match(section, /Ask before launching without `--port`, because unsent drafts will not carry over/);
});

test('review launch obeys the same identity guard, including every generated adapter', () => {
  const outputs = buildAdapters({ source: join(repository, 'skills') });
  for (const [host, files] of Object.entries(outputs)) {
    const skill = [...files].filter(([name]) => /studio-editor\/(?:SKILL\.md|references\/review-cli\.md)$/.test(name)).map(([, bytes]) => bytes.toString()).join('\n');
    const section = skill.split('## Open for review\n')[1]?.split('\n## ')[0];
    assert.ok(section, `${host}: review launch procedure exists`);
    assertReviewLaunch(section);
    assert.ok(section.includes('~/.praxity/bin/praxity identity init .\n~/.praxity/bin/praxity studio . --review --no-open'));
    assert.equal(assertCommandProcedures(skill, host).studio, 3);
    const init = '~/.praxity/bin/praxity identity init .\n';
    for (const replacement of ['', '~/.praxity/bin/praxity identity init ./other-course\n']) {
      assert.throws(() => assertCommandProcedures(skill.replace(section, section.replace(init, replacement)), host));
    }
    assert.match(section, /already running.*review enabled/s);
    assert.match(section, /without review.*restart/s);
    assert.match(section, /background process/);
    assert.match(section, /preview_open.*preview_navigate/s);
    assert.match(section, /open: true/);
    assert.match(section.replace(/\s+/g, ' '), /If a Studio you did not start may be serving this folder, ask the person to save and stop it, or to confirm none is running/);
    assert.match(section, /Never start a second one\./);
  }
});

test('review identity guard rejects both a replacement exemption and an appended exemption', () => {
  const skill = readStudioWorkflow();
  const section = skill.split('## Open for review\n')[1].split('\n## ')[0];
  assertReviewLaunch(section);
  assert.throws(() => assertReviewLaunch(section.replace(/Before every open or restart,[\s\S]*?identity rule\./,
    "Open Studio's identity stop-and-ask rule does not apply to review launches.")), /exact identity stop rule/);
  assert.throws(() => assertReviewLaunch(section + '\nReview launches are exempt from identity initialization.'), /no identity exemption/);
});

test('read-only Studio help does not need identity initialization', () => {
  assert.deepEqual(assertCommandProcedures('`~/.praxity/bin/praxity studio --help`'), { studio: 0, export: 0 });
});

for (const operation of ['studio', 'export']) test(`${operation} guards cover launcher forms, fences, chains and prose spans`, () => {
  const wrap = code => `${studioStopRule}\n\n${code}`;
  const variants = [
    `"$HOME/.praxity/bin/praxity" ${operation} ./x`,
    `praxity ${operation}`,
    `praxity  ${operation} ./x`,
    `cd x && praxity ${operation} ./x`,
    `echo ready; praxity ${operation} ./x`,
    `npx praxity ${operation} ./x`,
    `/opt/bin/praxity ${operation} ./x`,
    `"$BIN/praxity" ${operation} ./x`,
    `  $ praxity\t${operation}\t./x`,
  ];
  for (const tag of ['', 'sh', 'text', 'console', 'anything']) for (const command of variants) {
    const code = `\`\`\`${tag}\n${command}\n\`\`\``;
    assert.throws(() => assertCommandProcedures(wrap(code)), /initialize the same course/, code);
    if (command !== `praxity ${operation}`) {
      const initialized = code.replace(`${tag}\n`, `${tag}\npraxity identity init ./x\n`);
      assert.equal(assertCommandProcedures(wrap(initialized))[operation], 1, code);
    }
  }
  for (const separator of [' && ', '; ', '\n']) {
    const command = `praxity identity init './a course'${separator}npx praxity ${operation} "./a course"`;
    assert.equal(assertCommandProcedures(wrap(`\`\`\`console\n${command}\n\`\`\``))[operation], 1);
  }
  for (const commands of [
    `praxity ${operation} ./x\npraxity identity init ./x`,
    `praxity identity init ./other\npraxity ${operation} ./x`,
    `praxity identity init ./x --yes\npraxity ${operation} ./x`,
    `praxity identity init --yes\npraxity ${operation} ./x`,
    `praxity identity init ./x\npraxity ${operation} ./x\npraxity ${operation} ./x`,
  ]) assert.throws(() => assertCommandProcedures(wrap(`\`\`\`\n${commands}\n\`\`\``)), /initialize the same course/);
  const prose = `Run \`praxity identity init ./x\` first. Then \`npx praxity ${operation} ./x\`.`;
  assert.equal(assertCommandProcedures(wrap(prose))[operation], 1);
  assert.throws(() => assertCommandProcedures(wrap(`Use \`praxity ${operation} ./x\`.`)), /initialize the same course/);
  assert.throws(() => assertCommandProcedures(wrap(prose.replace('first.', 'first.\n## Another section\n'))), /initialize the same course/);
  assert.throws(() => assertCommandProcedures(wrap(prose.replace('first.', 'first.\n```sh\n') + '\n```')), /initialize the same course/);
  assert.throws(() => assertCommandProcedures(wrap(prose.replace(`npx praxity ${operation} ./x`, `cd x && praxity ${operation} ./x`))), /initialize the same course/);
  assert.throws(() => assertCommandProcedures(wrap(`\`praxity ${operation} ./x\`, then \`praxity identity init ./x\`.`)), /initialize the same course/);
  assert.throws(() => assertCommandProcedures(wrap(`\`praxity identity init ./x --yes\` then \`praxity ${operation} ./x\`.`)), /initialize the same course/);
  assert.equal(assertCommandProcedures(wrap(`~~~text\npraxity identity init ./x\npraxity ${operation} ./x\n~~~`))[operation], 1);
});

test('export guards reject misplaced or missing initialization, flags and stray rederivation', () => {
  const skill = readFileSync(join(repository, 'skills/install-praxity/SKILL.md'), 'utf8');
  const step = skill.match(/^Before every export,[^\n]*\n/m)[0];
  const withoutStep = skill.replace(step, '');
  assert.throws(() => assertExportProcedure(withoutStep));
  assert.throws(() => assertExportProcedure(`${withoutStep}\n${step}`));
  for (const command of ['~/.praxity/bin/praxity identity init --yes', '~/.praxity/bin/praxity identity init <course-folder> --yes']) {
    assert.throws(() => assertExportProcedure(skill.replace('~/.praxity/bin/praxity identity init <course-folder>', command)));
  }
  assert.throws(() => assertRederivationRule(`${skill}\nUse --rederive.\n`, true));
  assert.throws(() => assertRederivationRule(skill.replaceAll(identityRule, 'check identity'), true));
});

test('canonical adapter generation matches reviewed golden files', t => {
  const { context } = fixture(t);
  const outputs = outputsFor(context);
  const snapshot = Object.fromEntries(Object.entries(outputs).map(([host, files]) => [host, Object.fromEntries([...files].map(([name, bytes]) => [name, createHash('sha256').update(bytes).digest('hex')]))]));
  assert.deepEqual(snapshot, JSON.parse(readFileSync(join(repository, 'test/golden/adapters.json'), 'utf8')));
  assert.deepEqual(Object.keys(outputs), ['claude', 'codex']);
  assert.equal([...outputs.claude.keys()].some(name => name.includes('/plugins/')), false);
});
test('generator CLI emits two portable host layouts', t => {
  const { root } = fixture(t);
  const output = join(root, 'built adapters');
  const result = spawnSync(process.execPath, [join(repository, 'scripts/build-adapters.mjs'), '--output', output], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  for (const path of ['claude/.claude/skills/install-praxity/SKILL.md', 'codex/.agents/skills/studio-editor/SKILL.md']) assert.ok(existsSync(join(output, path)));
  const rerun = spawnSync(process.execPath, [join(repository, 'scripts/build-adapters.mjs'), '--output', output], { encoding: 'utf8' });
  assert.equal(rerun.status, 1); assert.match(rerun.stderr, /already exists/);
});
test('tool-owned skills and references are collected unchanged', t => {
  const { context } = fixture(t);
  const tool = join(context.root, 'tool skill');
  mkdirSync(join(tool, 'references'), { recursive: true });
  const skill = '---\nname: praxity-trace\ndescription: Trace a course.\n---\nOwned by Trace.\n';
  writeFileSync(join(tool, 'SKILL.md'), skill);
  writeFileSync(join(tool, 'references/legal.txt'), 'Required notice.\n');
  const outputs = buildAdapters({ source: join(context.root, 'skills'), tools: [tool] });
  assert.equal(outputs.codex.get('.agents/skills/praxity-trace/SKILL.md').toString(), skill);
  assert.equal(outputs.claude.get('.claude/skills/praxity-trace/references/legal.txt').toString(), 'Required notice.\n');
  assert.throws(() => buildAdapters({ source: join(context.root, 'skills'), tools: [tool, tool] }), /Duplicate skill/);
});
function brokenLinks(files) {
  const broken = [];
  for (const [name, bytes] of files) {
    if (!name.endsWith('.md')) continue;
    // Fenced and inline code hold placeholders, not links an agent follows.
    const prose = bytes.toString().replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '').replace(/(`+)[\s\S]*?\1/g, '');
    for (const [, href] of prose.matchAll(/\]\(([^\s)]+)\)/g)) {
      if (/^(?:[a-z][\w+.-]*:|#)/i.test(href)) continue;
      // Each skill is installed and loaded on its own, so a link must stay in its own folder.
      const root = `${name.split('/').slice(0, 3).join('/')}/`;
      const target = posix.normalize(posix.join(posix.dirname(name), href.split('#')[0]));
      if (!target.startsWith(root) || !files.has(target)) broken.push(`${name} -> ${href}`);
    }
  }
  return broken;
}

test('every relative link in an installed skill resolves inside the adapter (T12)', t => {
  const { context } = fixture(t);
  // Studio ships SKILL.md at the root of prax-format/, with its references beside it.
  const studio = join(context.root, 'tools/studio/prax-format');
  mkdirSync(join(studio, 'skill'), { recursive: true }); mkdirSync(join(studio, 'reference'));
  writeFileSync(join(studio, 'SKILL.md'), '---\nname: prax-format\ndescription: Write a course.\n---\nRead [blocks](reference/blocks.md) and [choices](skill/assessments.md).\n');
  writeFileSync(join(studio, 'skill/assessments.md'), 'See [blocks](../reference/blocks.md#choice). Not a link: `![alt](source)`.\n');
  writeFileSync(join(studio, 'reference/blocks.md'), '# Blocks\n');
  const outputs = buildAdapters({ source: join(repository, 'skills'), tools: [studio] });
  for (const host of ['claude', 'codex']) assert.deepEqual(brokenLinks(outputs[host]), [], host);
  assert.ok(outputs.claude.has('.claude/skills/prax-format/reference/blocks.md'));
  // A skill that links out of its own folder fails the same check.
  writeFileSync(join(studio, 'SKILL.md'), '---\nname: prax-format\ndescription: Write a course.\n---\nRead [blocks](../reference/blocks.md).\n');
  const outside = buildAdapters({ source: join(repository, 'skills'), tools: [studio] });
  assert.deepEqual(brokenLinks(outside.codex), ['.agents/skills/prax-format/SKILL.md -> ../reference/blocks.md']);
  // So does a link into another installed skill, although its target exists.
  writeFileSync(join(studio, 'SKILL.md'), '---\nname: prax-format\ndescription: Write a course.\n---\nSee [the editor](../studio-editor/SKILL.md).\n');
  const sibling = buildAdapters({ source: join(repository, 'skills'), tools: [studio] });
  assert.ok(sibling.codex.has('.agents/skills/studio-editor/SKILL.md'));
  assert.deepEqual(brokenLinks(sibling.codex), ['.agents/skills/prax-format/SKILL.md -> ../studio-editor/SKILL.md']);
});

test('portable CRLF skills retain their bytes and require real frontmatter', t => {
  const { context } = fixture(t);
  const tool = join(context.root, 'Windows portable skill'); mkdirSync(tool);
  const skill = '---\r\nname: praxity-check\r\ndescription: Check a course.\r\n---\r\nTool-owned instructions.\r\n';
  writeFileSync(join(tool, 'SKILL.md'), skill);
  const options = { source: join(context.root, 'skills'), tools: [tool] };
  assert.equal(buildAdapters(options).codex.get('.agents/skills/praxity-check/SKILL.md').toString(), skill);
  writeFileSync(join(tool, 'SKILL.md'), '---\nname: praxity-check\n---\nNo description.\n');
  assert.throws(() => buildAdapters(options), /Invalid skill frontmatter/);
});
test('install is idempotent and aliases share one adapter while distinct hosts coexist', t => {
  const { context } = fixture(t);
  const options = { base: context.home, otherBase: context.cwd, outputs: outputsFor(context) };
  installSkills({ ...options, host: 't3' });
  installSkills({ ...options, host: 't3' });
  assert.ok(existsSync(join(context.home, '.claude/skills/studio-editor/SKILL.md')));
  installSkills({ ...options, host: 'claude' });
  assert.ok(existsSync(join(context.home, '.claude/skills/studio-editor/SKILL.md')));
  assert.equal(existsSync(join(context.home, '.claude/plugins/praxity/.claude-plugin/plugin.json')), false);
  installSkills({ ...options, host: 'codex' });
  assert.equal(existsSync(join(context.home, '.claude/plugins/praxity/skills/studio-editor/SKILL.md')), false);
  assert.ok(existsSync(join(context.home, '.agents/skills/studio-editor/SKILL.md')));
  assert.deepEqual(JSON.parse(readFileSync(join(context.home, '.praxity/toolkit-skills.json'))).hosts, ['claude', 'codex']);
});
test('different hosts may use different scopes and removal cannot erase the other scope', t => {
  const { context } = fixture(t), outputs = outputsFor(context);
  installSkills({ base: context.home, otherBase: context.cwd, host: 'claude', outputs });
  installSkills({ base: context.cwd, otherBase: context.home, host: 'codex', outputs });
  uninstallSkills({ base: context.cwd, otherBase: context.home, host: 'codex', outputs });
  assert.deepEqual(readState(context.cwd).hosts, []);
  assert.deepEqual(readState(context.home).hosts, ['claude']);
  assert.ok(existsSync(join(context.home, '.claude/skills/studio-editor/SKILL.md')));
});

test('uninstall through the CLI removes the aliased adapter and keeps other owned and unowned files', async t => {
  const { context } = fixture(t);
  for (const host of ['t3', 'codex']) await runCli(['skills', 'install', '--host', host, '--scope', 'project'], context, { print: () => {} });
  const personal = join(context.cwd, '.claude/skills/personal/SKILL.md'); mkdirSync(join(personal, '..'), { recursive: true }); writeFileSync(personal, 'PERSONAL');
  await runCli(['skills', 'uninstall', '--host', 't3', '--scope', 'project'], context, { print: () => {} });
  assert.deepEqual(readState(context.cwd).hosts, ['codex']);
  assert.ok(existsSync(join(context.cwd, '.agents/skills/studio-editor/SKILL.md')));
  assert.equal(existsSync(join(context.cwd, '.claude/skills/studio-editor/SKILL.md')), false);
  assert.equal(readFileSync(personal, 'utf8'), 'PERSONAL');
  await runCli(['skills', 'uninstall', '--host', 'codex', '--scope', 'project'], context, { print: () => {} });
  assert.deepEqual(readState(context.cwd).skills, {});
  await runCli(['skills', 'uninstall', '--host', 'codex', '--scope', 'project'], context, { print: () => {} });
  assert.equal(readFileSync(personal, 'utf8'), 'PERSONAL');
});

test('selective uninstall retains the exact installed content when the canonical source has changed', t => {
  const { context } = fixture(t), outputs = outputsFor(context);
  for (const host of ['claude', 'codex']) installSkills({ base: context.home, host, outputs });
  const before = readFileSync(join(context.home, '.claude/skills/studio-editor/SKILL.md'));
  writeFileSync(join(context.root, 'skills/studio-editor/SKILL.md'), '---\nname: studio-editor\ndescription: Changed packaged skill.\n---\nNEW VERSION\n');
  uninstallSkills({ base: context.home, host: 'codex', outputs: outputsFor(context) });
  assert.deepEqual(readFileSync(join(context.home, '.claude/skills/studio-editor/SKILL.md')), before);
  assert.deepEqual(readState(context.home).hosts, ['claude']);
  assert.equal(existsSync(join(context.home, '.agents/skills/studio-editor/SKILL.md')), false);
});

test('uninstall tolerates owned files the user deleted, in the removed and the kept adapter', t => {
  const { context } = fixture(t), outputs = outputsFor(context);
  for (const host of ['claude', 'codex']) installSkills({ base: context.home, host, outputs });
  unlinkSync(join(context.home, '.claude/skills/studio-editor/SKILL.md'));
  unlinkSync(join(context.home, '.agents/skills/studio-editor/SKILL.md'));
  uninstallSkills({ base: context.home, host: 'claude', outputs });
  assert.deepEqual(readState(context.home).hosts, ['codex']);
  assert.equal(existsSync(join(context.home, '.claude/skills/install-praxity/SKILL.md')), false);
  assert.ok(existsSync(join(context.home, '.agents/skills/install-praxity/SKILL.md')));
  assert.equal(existsSync(join(context.home, '.agents/skills/studio-editor/SKILL.md')), false);
  uninstallSkills({ base: context.home, host: 'codex', outputs });
  assert.deepEqual(readState(context.home).skills, {});
});

for (const hosts of [['claude', 'claude'], ['t3'], ['unknown'], []]) test(`invalid adapter set ${JSON.stringify(hosts)} preserves all owned files`, t => {
  const { context } = fixture(t), outputs = outputsFor(context);
  installSkills({ base: context.home, host: 'claude', outputs });
  const state = readState(context.home);
  writeFileSync(join(context.home, '.praxity/toolkit-skills.json'), JSON.stringify({ ...state, hosts }));
  assert.throws(() => uninstallSkills({ base: context.home, host: 'claude', outputs }), /Unreadable skills ownership record/);
  assert.ok(existsSync(join(context.home, '.claude/skills/studio-editor/SKILL.md')));
});

test('Codex installation and removal leave an unrelated symlinked Claude home alone', t => {
  const { context } = fixture(t), outputs = outputsFor(context);
  const personal = join(context.root, 'personal-claude'); mkdirSync(personal); writeFileSync(join(personal, 'notes.txt'), 'PERSONAL');
  symlinkSync(personal, join(context.home, '.claude'), process.platform === 'win32' ? 'junction' : 'dir');
  installSkills({ base: context.home, host: 'codex', outputs });
  uninstallSkills({ base: context.home, host: 'codex', outputs });
  assert.equal(readFileSync(join(personal, 'notes.txt'), 'utf8'), 'PERSONAL');
  assert.deepEqual(readState(context.home).skills, {});
});

test('cross-scope installation refuses competing copies', t => {
  const { context } = fixture(t);
  const outputs = outputsFor(context);
  installSkills({ base: context.home, otherBase: context.cwd, host: 't3', outputs });
  assert.throws(() => installSkills({ base: context.cwd, otherBase: context.home, host: 't3', outputs }), /other scope/);
});
test('symlinked adapter roots are refused', t => {
  const { context } = fixture(t);
  const target = join(context.root, 'outside'); mkdirSync(target);
  symlinkSync(target, join(context.home, '.claude'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => installSkills({ base: context.home, host: 't3', outputs: outputsFor(context) }), /symlink refused/);
});
test('launcher installs selected scope; doctor checks two physical adapters', async t => {
  const { context } = fixture(t);
  await runCli(['skills', 'install', '--host', 't3', '--scope', 'project'], context, { print: () => {} });
  const result = doctor(context, () => ({ code: 0, stdout: 'v24.22.1', stderr: '' }));
  assert.equal(result.items.find(item => item.id === 'host.claude.project').status, 'ok');
  assert.equal(result.items.find(item => item.id === 'host.codex.project').status, 'not-installed');
  assert.equal(result.items.some(item => item.id.startsWith('host.t3.')), false);
});

test('dangling symlink in an adapter ancestor is refused before mutations', t => {
  const { context } = fixture(t);
  symlinkSync(join(context.root, 'missing'), join(context.home, '.claude'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => installSkills({ base: context.home, host: 't3', outputs: outputsFor(context) }), /symlink refused/);
});

test('doctor names every missing skill and its install command even when no adapter is installed', t => {
  const { context } = fixture(t);
  const result = doctor(context, () => ({ code: 0, stdout: 'v24.22.1', stderr: '' }));
  for (const scope of ['user', 'project']) for (const host of ['claude', 'codex']) {
    assert.deepEqual(result.items.find(item => item.id === `host.${host}.${scope}`), {
      id: `host.${host}.${scope}`, status: 'not-installed',
      message: 'Missing skills: assessment-writing, composer, install-praxity, studio-editor.',
      fix: `praxity skills install --host ${host} --scope ${scope}`,
    });
  }
});

test('doctor names skills missing after an upgrade, and refresh adds them without touching user skills', async t => {
  const { context } = fixture(t), quiet = { print: () => {} };
  await runCli(['skills', 'install', '--host', 'claude', '--scope', 'user'], context, quiet);
  const userSkill = join(context.home, '.claude/skills/my-notes/SKILL.md');
  mkdirSync(join(userSkill, '..')); writeFileSync(userSkill, 'USER SKILL');
  // The upgraded pack adds Import and its skill.
  fakeTool(context, 'import');
  mkdirSync(join(context.root, 'tools/import/skill'));
  writeFileSync(join(context.root, 'tools/import/skill/SKILL.md'), '---\nname: praxity-import\ndescription: Convert a course.\n---\nImport skill.\n');
  const host = () => doctor(context, () => ({ code: 0, stdout: 'v24.22.1', stderr: '' })).items.find(item => item.id === 'host.claude.user');
  assert.deepEqual(host(), { id: 'host.claude.user', status: 'partial', message: 'Missing skills: praxity-import.', fix: 'praxity skills install --host claude --scope user' });
  await runCli(['skills', 'refresh', '--scope', 'user'], context, quiet);
  assert.equal(host().status, 'ok');
  assert.equal(readFileSync(userSkill, 'utf8'), 'USER SKILL');
  assert.deepEqual(readState(context.home).hosts, ['claude']);
  assert.equal(existsSync(join(context.home, '.agents')), false);
  await runCli(['skills', 'refresh', '--scope', 'project'], context, quiet);
  assert.equal(existsSync(join(context.cwd, '.praxity')), false);
});


test('reinstall replaces named folders and preserves unrelated skill folders', t => {
  const { context } = fixture(t);
  const options = { base: context.home, host: 'claude', outputs: outputsFor(context) };
  installSkills(options);
  const folder = join(context.home, '.claude/skills/studio-editor');
  writeFileSync(join(folder, 'SKILL.md'), 'Edited');
  writeFileSync(join(folder, 'extra.txt'), 'Stale');
  mkdirSync(join(context.home, '.claude/skills/my-skill'));
  writeFileSync(join(context.home, '.claude/skills/my-skill/SKILL.md'), 'My skill');
  installSkills(options);
  assert.deepEqual(readFileSync(join(folder, 'SKILL.md')), options.outputs.claude.get('.claude/skills/studio-editor/SKILL.md'));
  assert.equal(existsSync(join(folder, 'extra.txt')), false);
  assert.equal(readFileSync(join(context.home, '.claude/skills/my-skill/SKILL.md'), 'utf8'), 'My skill');
});

for (const name of ['../notes', '/notes', 'C:/notes', '..']) test(`invalid recorded skill name ${name} refuses removal`, t => {
  const { context } = fixture(t);
  installSkills({ base: context.home, host: 'claude', outputs: outputsFor(context) });
  const state = readState(context.home); state.skills.claude = [name];
  writeFileSync(join(context.home, '.praxity/toolkit-skills.json'), JSON.stringify(state));
  assert.throws(() => uninstallSkills({ base: context.home, host: 'claude', outputs: outputsFor(context) }), /Unreadable skills ownership record/);
  assert.ok(existsSync(join(context.home, '.claude/skills/studio-editor/SKILL.md')));
});

test('doctor reports changed skills and reinstall repairs them', async t => {
  const { context } = fixture(t), quiet = { print() {} };
  await runCli(['skills', 'install', '--host', 'codex', '--scope', 'project'], context, quiet);
  writeFileSync(join(context.cwd, '.agents/skills/studio-editor/SKILL.md'), 'Edited');
  const host = () => doctor(context, () => ({ code: 0, stdout: 'v24.22.1', stderr: '' })).items.find(item => item.id === 'host.codex.project');
  assert.equal(host().status, 'partial');
  assert.equal(host().message, 'Changed or out-of-date skills: studio-editor.');
  assert.equal(host().fix, 'praxity skills install --host codex --scope project');
  await runCli(['skills', 'install', '--host', 'codex', '--scope', 'project'], context, quiet);
  assert.equal(host().status, 'ok');
});

for (const operation of ['install', 'uninstall']) for (const recorded of [false, true]) test(`${operation} refuses an unowned same-name skill folder, record=${recorded}`, async t => {
  const { context } = fixture(t);
  const folder = join(context.home, '.claude/skills/composer');
  mkdirSync(folder, { recursive: true }); writeFileSync(join(folder, 'notes.txt'), 'My own skill');
  writeFileSync(join(folder, 'SKILL.md'), 'My own skill definition');
  if (recorded) {
    mkdirSync(join(context.home, '.praxity'));
    writeFileSync(join(context.home, '.praxity/toolkit-skills.json'), '{"owner":"praxity-toolkit","hosts":["claude"],"skills":{"claude":[]}}');
  }
  await assert.rejects(runCli(['skills', operation, '--host', 'claude', '--scope', 'user'], context, { print() {} }), /Unowned skill folder.*composer.*refusing/i);
  assert.equal(readFileSync(join(folder, 'notes.txt'), 'utf8'), 'My own skill');
  assert.equal(readFileSync(join(folder, 'SKILL.md'), 'utf8'), 'My own skill definition');
});

test('a failed skill copy records its names before writing and can be retried', t => {
  const { context } = fixture(t);
  const outputs = { claude: new Map([['.claude/skills/composer/SKILL.md', null]]) };
  const options = { base: context.home, host: 'claude', outputs };
  assert.throws(() => installSkills(options), { code: 'ERR_INVALID_ARG_TYPE' });
  assert.deepEqual(readState(context.home), { owner: 'praxity-toolkit', hosts: ['claude'], skills: { claude: ['composer'] } });
  outputs.claude.set('.claude/skills/composer/SKILL.md', Buffer.from('Fresh skill\n'));
  installSkills(options);
  assert.equal(readFileSync(join(context.home, '.claude/skills/composer/SKILL.md'), 'utf8'), 'Fresh skill\n');
});
