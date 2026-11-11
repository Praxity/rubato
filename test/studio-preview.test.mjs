import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Studio preview handoff checks loading and visibility and discloses fallback', () => {
  const skill = readFileSync(new URL('../skills/studio-editor/SKILL.md', import.meta.url), 'utf8');
  const opening = skill.split('## Open Studio')[1].split('## Act on an annotation')[0];
  assert.match(opening, /Search the host's available tools.*before deciding.*missing/s);
  assert.match(opening, /confirm.*loaded.*title.*expected.*element/s);
  assert.match(opening, /preview_status.*preview_snapshot/s);
  assert.match(opening, /load fails.*times out.*visible: false.*say.*preview.*not.*visible/s);
  assert.match(opening, /Studio may be running on another machine.*showing the preview/s);
  assert.match(opening, /open.*URL.*machine running Studio.*host's documented port forwarding/s);
  assert.match(opening, /T3.*planned.*gateway.*not a loopback tunnel/s);
  assert.match(opening, /Never.*weaken.*origin checks/s);
  assert.match(opening, /URL only in preview\/browser calls.*never paste it into the conversation/s);
  assert.match(opening, /fall back to the system browser, tell the person.*why/s);
  assert.doesNotMatch(opening, /give it to the person in this conversation/);
});
