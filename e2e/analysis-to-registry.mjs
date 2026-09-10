#!/usr/bin/env node
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {assertAnalysis} from '../contract/analysis.mjs';
const [input,output]=process.argv.slice(2);
if(!input||!output) throw new Error('usage: analysis-to-registry.mjs <analysis.json> <registry.json>');
const a=JSON.parse(readFileSync(input,'utf8'));assertAnalysis(a);
const scopes=a.deliveryScopes??['core'];
const selected=a.capabilities.filter(c=>c.status!=='broken'&&scopes.includes(c.scope??'core'));
const fields=['mechanism','methodName','pattern','binder','interfaceClass','servicePackage','serviceClass','bindAction','component','extras','dataUri','preconditions','safetyLevel','sessionPackage','timeoutMs'];
const tools=a.transport ? [] : selected.map(c=>{
  if(!['aidl','execmd','intent','media'].includes(c.mechanism)) throw new Error(`Unsupported executor mechanism for ${c.id}: ${c.mechanism}`);
  return {id:c.dispatch?.operation??c.id,status:c.status,sourceRef:c.sourceRef,...Object.fromEntries(fields.filter(k=>c[k]!==undefined).map(k=>[k,c[k]]))};
});
for(const name of a.builtins??[]) tools.push({id:name,mechanism:'media',methodName:name.slice('media_'.length),status:'probe',sourceRef:'BRIDGE builtin media',safetyLevel:'normal'});
if(new Set(tools.map(t=>t.id)).size!==tools.length) throw new Error('Duplicate executor operation');
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,JSON.stringify({tools},null,2)+'\n');
console.log(`registry written: ${tools.length} tools -> ${output}${a.transport?' (host HTTP transport; no Android registry needed)':''}`);
