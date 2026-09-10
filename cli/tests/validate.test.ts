import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { validateAnalysis } from '../../contract/analysis.mjs';
import { dispatch } from '../src/cli.js';

const root=join(import.meta.dirname,'../..');
const example=(name:string)=>JSON.parse(readFileSync(join(root,name),'utf8'));
describe('shared analysis validator',()=>{
  it.each(['e2e/bridge-analysis.json','examples/channel-analysis.json','examples/android-analysis.json'])('accepts %s through the standalone entrypoint',path=>{
    const r=spawnSync(process.execPath,[join(root,'skills/bridge-analyze/validate-analysis.mjs'),join(root,path)],{encoding:'utf8'});
    expect(r.status,r.stderr).toBe(0);expect(r.stdout).toContain('PASS');
  });
  it('rejects a binder capability without a service target',()=>{
    const a=example('examples/android-analysis.json');Object.assign(a.capabilities[0],{mechanism:'aidl',methodName:'call',interfaceClass:'org.example.IDevice'});
    expect(validateAnalysis(a).join('\n')).toContain('servicePackage required');
  });
  it('rejects ambiguous action and nested parameter contracts',()=>{
    const a=example('examples/channel-analysis.json');a.capabilities[1].publicAction=a.capabilities[0].publicAction;
    a.capabilities[0].params.push({name:'nested',type:'object',properties:[],required:['missing']});
    const errors=validateAnalysis(a).join('\n');expect(errors).toContain('duplicate channel action');expect(errors).toContain('required references undeclared');
  });
  it('keeps the retired validate CLI absent',async()=>{
    const stderr=vi.spyOn(process.stderr,'write').mockImplementation(()=>true);
    try{expect(await dispatch(['validate','analysis.json'])).toBe(1);expect(stderr.mock.calls.flat().join('')).toContain('Unknown command: validate');}finally{stderr.mockRestore();}
  });
});
