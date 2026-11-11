import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, repository, examplePack } from './helpers.mjs';
import { installVerifiedPack, refreshInstalledSkills } from '../src/update.mjs';

test('verified local bootstrap passes its digest and refreshes recorded project skills', t => {
  const f = fixture(t), bootstrap = join(f.root, 'bootstrap'); mkdirSync(bootstrap);
  cpSync(join(repository, 'schemas'), join(bootstrap, 'schemas'), { recursive: true });
  const pack = examplePack(), manifest = Buffer.from(JSON.stringify(pack));
  writeFileSync(join(bootstrap, 'pack.json'), manifest);
  mkdirSync(join(f.home, '.praxity/toolkit'), { recursive: true });
  mkdirSync(join(f.root, 'course/.praxity'), { recursive: true });
  writeFileSync(join(f.root, 'course/.praxity/toolkit-skills.json'), '{}');
  const calls = [], output = [];
  const context = { ...f.context, home: f.home, cwd: join(f.root, 'course'), state: { platform: 'darwin-arm64' } };
  const code = installVerifiedPack(context, { bootstrap, manifest }, {
    print: line => output.push(line),
    updateProcess: (invocation, options) => {
      calls.push([invocation, options]);
      if (invocation.args[0] === join(bootstrap, 'install.sh')) writeFileSync(join(f.home, '.praxity/toolkit/active'), `${pack.version}\n\n`);
      return { code: 0, stdout: '', stderr: '' };
    },
  });
  assert.equal(code, 0);
  assert.deepEqual(calls.map(([call]) => call.command), ['ps', 'sh', 'sh']);
  assert.deepEqual(calls[1][0].args, [join(bootstrap, 'install.sh'), '--manifest-sha256', createHash('sha256').update(manifest).digest('hex'), '--platform', 'darwin-arm64']);
  assert.equal(calls[1][1].timeout, undefined);
  assert.equal(calls[2][1].cwd, join(f.root, 'course'));
  assert.match(readFileSync(join(f.home, '.praxity/toolkit/active'), 'utf8'), /^0\.1\.0/);
});

test('pack refresh discovers the project and reports a conflicting user file',t=>{
 const f=fixture(t);mkdirSync(join(f.root,'course/.praxity'),{recursive:true});writeFileSync(join(f.root,'course/.praxity/toolkit-skills.json'),'{"owner":"praxity-toolkit","hosts":["claude"],"skills":{"claude":["prax-format"]}}');mkdirSync(join(f.root,'course/lesson'));
 const calls=[],output=[];
 const code=refreshInstalledSkills({...f.context,home:f.home,cwd:join(f.root,'course/lesson')},{print:line=>output.push(line),updateProcess:(call,options)=>{calls.push([call,options]);return call.args.at(-1)==='user'?{code:1,stderr:'Owned adapter changed: /fixture/prax-format/SKILL.md'}:{code:0};}},true);
 assert.equal(code,1);assert.deepEqual(calls.map(([call])=>call.args.at(-1)),['user','project']);assert.equal(calls[1][1].cwd,join(f.root,'course'));assert.match(output[0],/prax-format\/SKILL.md.*--scope user/);
});
