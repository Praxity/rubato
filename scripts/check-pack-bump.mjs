import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { manifestBumpError } from '../src/manifest.mjs';

const base = JSON.parse(execFileSync('git', ['show', `${process.argv[2]}:pack.json`], { encoding: 'utf8' }));
const error = manifestBumpError(base, JSON.parse(readFileSync('pack.json', 'utf8')));
if (error) {
  console.error(error);
  process.exitCode = 1;
}
