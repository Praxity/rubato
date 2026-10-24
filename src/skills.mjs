import { existsSync, lstatSync, readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync, renameSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve, sep, isAbsolute, win32 } from 'node:path';
import { loadSchema, validateSchema } from './schema.mjs';

export const adapters = {
  claude: { skills: '.claude/skills' },
  codex: { skills: '.agents/skills' },
};
const canonicalHost = host => host === 't3' ? 'claude' : host;

function filesIn(directory, prefix = '') {
  const files = new Map();
  for (const item of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = prefix + item.name;
    if (item.isSymbolicLink()) throw new Error(`Skill symlink refused: ${join(directory, item.name)}`);
    if (item.isDirectory()) for (const [file, bytes] of filesIn(join(directory, item.name), `${name}/`)) files.set(file, bytes);
    else if (item.isFile()) files.set(name, readFileSync(join(directory, item.name)));
    else throw new Error(`Unsupported skill file: ${name}`);
  }
  return files;
}

export function buildAdapters({ source, tools = [] }) {
  const skills = new Map();
  const collect = directory => {
    const files = filesIn(directory);
    const text = files.get('SKILL.md')?.toString();
    const frontmatter = text?.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
    const name = frontmatter?.match(/^name:\s*["']?([a-z0-9-]+)["']?\s*$/m)?.[1];
    if (!name || !/^description:\s*\S/m.test(frontmatter)) throw new Error(`Invalid skill frontmatter: ${directory}`);
    if (skills.has(name)) throw new Error(`Duplicate skill name: ${name}`);
    skills.set(name, files);
  };
  for (const item of readdirSync(source, { withFileTypes: true })) {
    if (!item.isDirectory()) throw new Error(`Expected skill directory: ${item.name}`);
    collect(join(source, item.name));
  }
  for (const tool of tools) {
    if (existsSync(join(tool, 'SKILL.md'))) collect(tool);
    else for (const item of readdirSync(tool, { withFileTypes: true })) {
      if (item.isDirectory() && existsSync(join(tool, item.name, 'SKILL.md'))) collect(join(tool, item.name));
    }
  }
  const generate = adapter => {
    const output = new Map();
    for (const [name, files] of [...skills].sort(([a], [b]) => a.localeCompare(b))) {
      for (const [file, bytes] of files) output.set(`${adapter.skills}/${name}/${file}`, bytes);
    }
    return output;
  };
  return Object.fromEntries(Object.entries(adapters).map(([host, adapter]) => [host, generate(adapter)]));
}

function contained(base, name) {
  if (typeof name !== 'string' || isAbsolute(name) || win32.isAbsolute(name) || name.includes('\\') || name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`Unsafe ownership path: ${name}`);
  const target = resolve(base, name);
  const rel = relative(base, target);
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..') throw new Error(`Unsafe ownership path: ${name}`);
  let cursor = target;
  while (cursor !== base) {
    let stat;
    try { stat = lstatSync(cursor); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat?.isSymbolicLink()) throw new Error(`Adapter symlink refused: ${cursor}`);
    if (stat) {
      const resolved = relative(base, realpathSync(cursor));
      if (resolved === '..' || resolved.startsWith(`..${sep}`) || isAbsolute(resolved)) throw new Error(`Unsafe ownership path: ${name}`);
    }
    cursor = dirname(cursor);
  }
  return target;
}

export function installSkills(options) {
  return changeSkills({ ...options, remove: false });
}

export function uninstallSkills(options) {
  return changeSkills({ ...options, remove: true });
}

export function findSkillsProject(cwd, home) {
  const user = realpathSync(home);
  for (let base = realpathSync(cwd); base !== user; base = dirname(base)) {
    if (existsSync(join(base, '.praxity/toolkit-skills.json'))) return base;
    if (dirname(base) === base) break;
  }
}

function readState(base) {
  const record = contained(base, '.praxity/toolkit-skills.json');
  if (!existsSync(record)) return { owner: 'praxity-toolkit', hosts: [], skills: {} };
  let state;
  try { state = JSON.parse(readFileSync(record, 'utf8')); }
  catch (cause) { throw new Error(`Unreadable skills ownership record: ${record}`, { cause }); }
  const errors = validateSchema(state, loadSchema('skills-ownership'));
  if (errors.length || new Set(state.hosts).size !== state.hosts.length) throw new Error(`Unreadable skills ownership record: ${record}`);
  for (const host of Object.keys(state.skills)) {
    if (!state.hosts.includes(host)) throw new Error(`Unreadable skills ownership record: ${record}`);
  }
  return state;
}

export function refreshSkills({ base, outputs }) {
  base = realpathSync(base);
  if (!readState(base).hosts.length) return { hosts: [], files: [] };
  return changeSkills({ base, outputs, remove: false });
}

function writeState(base, state) {
  state.hosts.sort();
  const record = contained(base, '.praxity/toolkit-skills.json');
  const temp = contained(base, '.praxity/toolkit-skills.json.tmp');
  mkdirSync(dirname(record), { recursive: true });
  writeFileSync(temp, JSON.stringify(state, null, 2) + '\n');
  renameSync(temp, record);
}

function changeSkills({ base, otherBase, host, outputs, remove }) {
  host = host === undefined ? undefined : canonicalHost(host);
  if (host !== undefined && !Object.hasOwn(adapters, host)) throw new Error('Host must be t3, claude or codex');
  base = realpathSync(base);
  const state = readState(base);
  const selected = host ? [host] : state.hosts;
  const files = [];
  const changes = selected.map(value => {
    const root = adapters[value].skills;
    const entries = remove ? [] : [...outputs[value]];
    const names = [...new Set(entries.map(([name]) => {
      if (!name.startsWith(`${root}/`)) throw new Error(`Unsafe adapter path: ${name}`);
      contained(base, name);
      const skill = name.slice(root.length + 1).split('/')[0];
      if (!/^[a-z0-9-]+$/.test(skill)) throw new Error(`Unsafe skill name: ${skill}`);
      return skill;
    }))];
    const owned = state.skills[value] ?? [];
    const directories = [...new Set(remove ? owned : [...owned, ...names])].map(name => {
      const directory = contained(base, `${root}/${name}`);
      if (!remove && existsSync(directory) && !owned.includes(name)) throw new Error(`Unowned skill folder: ${directory}; refusing overwrite. Move it aside before retrying.`);
      return directory;
    });
    if (!remove && otherBase && realpathSync(otherBase) !== base) for (const name of names) {
      const competing = contained(realpathSync(otherBase), `${root}/${name}/SKILL.md`);
      if (existsSync(competing)) throw new Error(`Competing skill in the other scope: ${competing}`);
    }
    return { value, entries, names, directories };
  });
  // Record names before copying so a rerun can replace a partial install.
  if (!remove) {
    for (const { value, names } of changes) {
      if (!state.hosts.includes(value)) state.hosts.push(value);
      state.skills[value] = [...new Set([...(state.skills[value] ?? []), ...names])];
    }
    writeState(base, state);
  }
  for (const { value, entries, names, directories } of changes) {
    for (const directory of directories) rmSync(directory, { recursive: true, force: true });
    if (remove) {
      state.hosts = state.hosts.filter(value => value !== host);
      delete state.skills[value];
    } else {
      state.skills[value] = names;
      for (const [name, bytes] of entries) {
        const path = contained(base, name);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, bytes);
        files.push(name);
      }
    }
  }
  writeState(base, state);
  return { host, hosts: state.hosts, files };
}

export function skillPresence({ base, host, outputs }) {
  readState(realpathSync(base));
  const adapter = adapters[canonicalHost(host)], result = { current: [], stale: [], missing: [] };
  const skills = new Map();
  for (const [name, bytes] of outputs[canonicalHost(host)]) {
    const skill = name.slice(adapter.skills.length + 1).split('/')[0];
    const path = join(base, name), present = existsSync(path) ? readFileSync(path) : null;
    skills.set(skill, (skills.get(skill) ?? true) && present !== null && present.equals(bytes));
  }
  for (const [skill, current] of skills) {
    result[current ? 'current' : existsSync(join(base, adapter.skills, skill, 'SKILL.md')) ? 'stale' : 'missing'].push(skill);
  }
  return result;
}
