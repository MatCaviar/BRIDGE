#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {validateAnalysis} from '../../contract/analysis.mjs';
try {
  if(!process.argv[2]) throw new Error('usage: validate-analysis.mjs <analysis.json>');
  const analysis=JSON.parse(readFileSync(process.argv[2],'utf8'));
  const errors=validateAnalysis(analysis);
  if(errors.length) throw new Error(errors.join('\n'));
  const scopes=analysis.deliveryScopes??['core'];
  const selected=analysis.capabilities.filter(c=>c.status!=='broken'&&scopes.includes(c.scope??'core'));
  const tools=analysis.toolContract?.mode==='channel'?(selected.length?1:0):selected.length+(analysis.builtins?.length??0);
  console.log(`PASS: ${selected.length} selected capabilities; ${tools} public tools`);
} catch(e) {console.error(e.message);process.exitCode=1;}
