import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

let launching = false;
try {
  if (process.argv.length < 3 || process.argv.length > 4) throw new Error('usage');
  const args = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  if (!Array.isArray(args) || !args.every(arg => typeof arg === 'string')) throw new Error('arguments');
  // An optional trusted executable path supports source CLI wrappers and fixture launchers.
  const executable = process.argv[3] ?? join(homedir(), '.praxity/bin/praxity');
  const script = /\.(?:mjs|js)$/i.test(executable);
  launching = true;
  execFileSync(script ? process.execPath : executable, script ? [executable, ...args] : args, {
    stdio: 'inherit', shell: false,
  });
} catch (error) {
  if (Number.isInteger(error.status) && error.status > 0) process.exitCode = error.status;
  else {
    // Parser and spawn errors can contain the untrusted replacement; keep them out of output.
    const message = launching
      ? error.code === 'ENOENT' ? 'Praxity launcher not found' : 'Cannot launch Praxity'
      : 'Cannot run Praxity. Use a readable JSON array of string arguments';
    process.stderr.write(`${message}${error.code ? ` (${error.code})` : ''}.\n`);
    process.exitCode = 1;
  }
}
