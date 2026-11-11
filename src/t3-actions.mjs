import { closeSync, copyFileSync, mkdtempSync, openSync, readSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const launcher = '"$HOME/.praxity/bin/praxity"';
const maxJsonBytes = 4 * 1024 * 1024;
const maxSnapshotFileBytes = 128n * 1024n * 1024n;

export const t3ActionsRepairNote = "T3 keeps a saved copy of imported actions. In T3's project Actions settings, delete each stale saved Praxity action and import it again from t3.json, or edit its saved command to match t3.json.";

export function courseActions(port) {
  return [
    { name: 'Open in Studio', command: `${launcher} action studio . --port ${port} --no-open`, icon: 'play', previewUrl: `http://127.0.0.1:${port}/launch`, autoOpenPreview: true },
    { name: 'Export HTML', command: `${launcher} action export . --format html --output course-html.zip`, icon: 'build' },
    { name: 'Export PDF', command: `${launcher} action export . --format pdf --output course.pdf`, icon: 'build' },
    { name: 'Check accessibility', command: `${launcher} check check course-html.zip --checks accessibility`, icon: 'lint' },
    { name: 'Doctor', command: `${launcher} doctor`, icon: 'configure' },
  ];
}

const managedNames = new Set(courseActions(0).map(action => action.name.toLowerCase()));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const managed = action => record(action) && typeof action.name === 'string' && managedNames.has(action.name.trim().toLowerCase());
const validAction = action => record(action) && typeof action.name === 'string' && typeof action.command === 'string' &&
  (action.previewUrl === undefined || typeof action.previewUrl === 'string');

function optionalJson(file) {
  // T3 is optional. Missing, unreadable or malformed host files are not a
  // toolkit failure, and none of these diagnostics repair host storage.
  let fd;
  try {
    fd = openSync(file, 'r');
    const buffer = Buffer.allocUnsafe(maxJsonBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = readSync(fd, buffer, length, buffer.length - length, null);
      if (!read) break;
      length += read;
    }
    if (length > maxJsonBytes) return undefined;
    return JSON.parse(buffer.subarray(0, length).toString('utf8'));
  }
  catch { return undefined; }
  finally { if (fd !== undefined) closeSync(fd); }
}

function savedActions(settings) {
  const canonical = record(settings.projectSettingsOverrides) ? settings.projectSettingsOverrides : {};
  const legacy = record(settings.projectScriptOverrides) ? settings.projectScriptOverrides : {};
  const saved = new Map();
  for (const id of new Set([...Object.keys(canonical), ...Object.keys(legacy)])) {
    const scripts = canonical[id]?.defaultProjectScripts ?? (settings.projectSettingsFolded === true ? undefined : legacy[id]);
    if (Array.isArray(scripts) && scripts.some(managed)) saved.set(id, scripts);
  }
  return saved;
}

function fileVersion(file) {
  try {
    const stat = statSync(file, { bigint: true });
    if (!stat.isFile() || stat.size > maxSnapshotFileBytes) throw new Error('Optional T3 mapping is not a bounded regular file');
    return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function projectFolders(directory) {
  let db, snapshot;
  try {
    const source = join(directory, 'statev2.sqlite');
    const files = [source, `${source}-wal`, `${source}-journal`];
    const before = files.map(fileVersion);
    if (!before[0] || before[2]) return [];
    snapshot = mkdtempSync(join(tmpdir(), 'praxity-t3-'));
    const copy = join(snapshot, 'statev2.sqlite');
    copyFileSync(source, copy);
    if (before[1]) copyFileSync(`${source}-wal`, `${copy}-wal`);
    // No live SQLite connection or locks. Reject observed writes, replacements,
    // WAL resets and journal changes during the copy instead of mixing versions.
    if (files.some((file, index) => fileVersion(file) !== before[index])) return [];
    // SQLite rebuilds its private WAL index and reads committed frames only.
    db = new DatabaseSync(copy, { readOnly: true });
    if (Object.values(db.prepare('PRAGMA quick_check').get())[0] !== 'ok') return [];
    return db.prepare('SELECT project_id AS id, title, workspace_root AS folder FROM projection_projects WHERE deleted_at IS NULL').all();
  } catch { return []; }
  finally { db?.close(); if (snapshot) rmSync(snapshot, { recursive: true, force: true }); }
}

function actionFields(action) {
  // T3 adds an ID and materializes defaults when importing. Compare the
  // imported fields, not those storage differences or JSON property order.
  return [action.name.trim(), action.command.trim(), action.icon ?? 'play',
    action.runOnWorktreeCreate ?? false,
    action.runOnWorktreeCreate ? (action.async ?? true) : true,
    action.runOnSettle ?? false, action.previewUrl?.trim() || '',
    action.previewUrl ? (action.autoOpenPreview ?? false) : false];
}

export function t3ActionWarnings({ home, cwd }) {
  const directory = join(home, '.t3/userdata'), settings = optionalJson(join(directory, 'settings.json'));
  const saved = record(settings) ? savedActions(settings) : new Map();
  const warnings = [];
  const folders = projectFolders(directory);
  if (cwd && !folders.some(project => project.folder === cwd)) folders.push({ id: 'current', title: 'current course', folder: cwd });
  for (const { id, title, folder } of folders) {
    if (typeof folder !== 'string' || !isAbsolute(folder)) continue;
    const project = optionalJson(join(folder, 't3.json'));
    if (!Array.isArray(project?.scripts) || !project.scripts.every(validAction)) continue;
    const studio = project.scripts.find(action => action.name === 'Open in Studio');
    const port = Number(studio?.command.match(/ --port (\d+)(?: --no-open)?$/)?.[1] ?? 0);
    const current = new Map(courseActions(port).map(action => [action.name.toLowerCase(), action]));
    const outdated = project.scripts.filter(action => managed(action) &&
      JSON.stringify(actionFields(action)) !== JSON.stringify(actionFields(current.get(action.name.trim().toLowerCase()))));
    if (outdated.length) warnings.push({ id: `t3.actions.${id}.project`, status: 'partial',
      message: `Praxity actions in ${folder}/t3.json differ from the current generator: ${outdated.map(action => action.name).join(', ')}.`,
      fix: `Run praxity init in ${folder}, then reimport the actions in T3. ${t3ActionsRepairNote}` });
    if (!saved.has(id)) continue;
    const expected = new Map(project.scripts.map(action => [action.name.trim().toLowerCase(), action]));
    const changed = saved.get(id).filter(action => {
      if (!managed(action) || !validAction(action)) return false;
      const source = expected.get(action.name.trim().toLowerCase());
      return !source || JSON.stringify(actionFields(action)) !== JSON.stringify(actionFields(source));
    });
    if (changed.length) warnings.push({ id: `t3.actions.${id}`, status: 'partial',
      message: `T3's saved Praxity actions for ${title} (${folder}) differ from t3.json: ${[...new Set(changed.map(action => action.name))].join(', ')}.`,
      fix: t3ActionsRepairNote });
  }
  return warnings;
}
