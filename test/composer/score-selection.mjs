// Scores a composer outline's pattern choices against a fixture's expected envelope.
// Usage: node score-selection.mjs <outline.md> <expected.md>
// Prints one JSON line; exits 1 when a hard check fails.
import { readFileSync } from 'node:fs';

const lastJsonBlock = (path) => {
  const blocks = [...readFileSync(path, 'utf8').matchAll(/```json\s*\n([\s\S]*?)\n```/g)];
  if (!blocks.length) throw new Error(`${path}: no json block`);
  return JSON.parse(blocks.at(-1)[1]);
};

export function score(selection, expected) {
  const chosen = [...new Set(selection.patterns.map((p) => p.pattern))];
  const envelope = new Set([...expected.required.flat(), ...expected.allowed]);
  const result = {
    chosen,
    missingRequired: expected.required.filter((group) => !group.some((id) => chosen.includes(id))),
    forbidden: chosen.filter((id) => expected.forbidden.includes(id)),
    outsideEnvelope: chosen.filter((id) => !envelope.has(id) && !expected.forbidden.includes(id)),
    untracedPatterns: selection.patterns.filter((p) => !p.barriers?.length).map((p) => p.pattern),
    environmentFlagged: selection.outsideCourse?.length ?? 0,
  };
  result.pass = !result.missingRequired.length && !result.forbidden.length && !result.outsideEnvelope.length
    && !result.untracedPatterns.length && (expected.environment.length === 0 || result.environmentFlagged > 0);
  return result;
}

if (process.argv[2] === '--self-test') {
  const expected = { required: [['a', 'b'], ['c']], allowed: ['d'], forbidden: ['x'], environment: ['e'] };
  const ok = score({ patterns: [{ pattern: 'b', barriers: ['k1'] }, { pattern: 'c', barriers: ['k2'] }], outsideCourse: [{}] }, expected);
  const bad = score({ patterns: [{ pattern: 'a', barriers: [] }, { pattern: 'x', barriers: ['k1'] }, { pattern: 'z', barriers: ['k1'] }] }, expected);
  if (!ok.pass || bad.pass || bad.missingRequired.length !== 1 || bad.forbidden[0] !== 'x'
    || bad.outsideEnvelope[0] !== 'z' || bad.untracedPatterns[0] !== 'a') throw new Error('self-test failed');
  console.log('self-test ok');
} else if (process.argv[2]) {
  const result = score(lastJsonBlock(process.argv[2]), lastJsonBlock(process.argv[3]));
  console.log(JSON.stringify(result));
  process.exitCode = result.pass ? 0 : 1;
}
