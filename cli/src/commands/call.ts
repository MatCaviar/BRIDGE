import {readFileSync} from 'node:fs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {buildMcpServer} from './serve.js';
import {activeCapabilities} from './schema.js';
import type {AnalysisData} from '../types.js';

/** A local invocation uses the same schema validation and response path as an upstream MCP client. */
export async function callCommand(argv:string[]):Promise<void>{
  const values:Record<string,string>={};
  for(let i=0;i<argv.length;i++){if(!['--analysis','--name','--op','--args','--device','--user','--preconditions-file'].includes(argv[i]))throw new Error(`Unknown call option: ${argv[i]}`);const key=argv[i];if(argv[i+1]===undefined)throw new Error(`Missing ${key} value`);values[key]=argv[++i];}
  if(!values['--analysis']||(!values['--name']&&!values['--op']))throw new Error('call requires --analysis <file> and --name <public tool> or --op <capability id>');
  const a=JSON.parse(readFileSync(values['--analysis'],'utf8')) as AnalysisData;
  const args=JSON.parse(values['--args']??'{}');
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('--args must be a JSON object');
  if (values['--name'] && values['--op']) throw new Error('Choose --name or --op');
  if (values['--user'] !== undefined && (!Number.isInteger(Number(values['--user'])) || Number(values['--user']) < 0)) throw new Error('Invalid Android user');
  if (!a.transport && !values['--device']) throw new Error('ADB transport requires --device');
  let name=values['--name']??values['--op'];
  if(values['--op']&&a.toolContract?.mode==='channel'){
    const cap=activeCapabilities(a).find(c=>c.id===values['--op']);if(!cap)throw new Error('Unknown or unavailable capability');
    name=a.toolContract.name!;args[a.toolContract.actionField??'action']=cap.publicAction??cap.id;
  }
  const server=buildMcpServer(a,{analysisPath:values['--analysis'],device:values['--device'],user:values['--user']===undefined?undefined:Number(values['--user']),preconditionsPath:values['--preconditions-file']});
  const [x,y]=InMemoryTransport.createLinkedPair();await server.connect(y);
  const client=new Client({name:'bridge-call',version:'1'},{capabilities:{}});await client.connect(x);
  try{
    const result=await client.callTool({name,arguments:args});
    const body=result.structuredContent??result.content;
    process.stdout.write(JSON.stringify(body)+'\n');
    if(result.isError)throw new Error('Tool execution failed');
  }finally{await client.close();await server.close();}
}
