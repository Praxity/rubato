import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Studio preview handoff checks loading and visibility and discloses fallback', () => {
  const skill = readFileSync(new URL('../skills/studio-editor/SKILL.md', import.meta.url), 'utf8');
  const opening = skill.split('## Open Studio')[1].split('## Act on an annotation')[0];
  assert.match(opening, /After opening.*confirm.*loaded/);
  assert.match(opening, /load fails.*visible: false.*say plainly/);
  assert.match(opening, /system browser.*tell the person.*why/);
  assert.match(opening, /neither a preview.*person's own screen.*give.*exact URL/);
  assert.match(opening, /private link.*edits their course/);
  assert.match(opening, /open it.*machine running Studio.*port forwarding/);
  assert.match(opening, /Keep the URL out of files.*settings.*shell history.*logs/);
  assert.match(opening, /Never.*weaken.*origin checks/);
});
