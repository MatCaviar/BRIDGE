import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {buildMcpServer} from '../src/commands/serve.js';
import {schemaArtifact, mcpToolArtifact, jsonSchemaFor} from '../src/commands/schema.js';
import {validateAnalysis} from '../../contract/analysis.mjs';
import {normalizeResponse} from '../src/utils/response.js';
import type {AnalysisData} from '../src/types.js';

const channel=()=>JSON.parse(readFileSync(new URL('../../examples/channel-analysis.json',import.meta.url),'utf8')) as AnalysisData;
const resultBody=(r:any)=>r.structuredContent??JSON.parse(r.content[0].text);
async function session(a:AnalysisData, run:(c:Client)=>Promise<void>, invoke:any=async()=>({ok:true,data:{code:0,data:{done:true},extras:{trace:'kept'}},reqId:'test',elapsedMs:0}), preconditions?:Record<string,boolean>){
  const s=buildMcpServer(a,{analysisPath:'test',device:'unused',preconditions},invoke);
  const [x,y]=InMemoryTransport.createLinkedPair();await s.connect(y);
  const c=new Client({name:'contract-test',version:'1'},{capabilities:{}});await c.connect(x);
  try{await run(c);}finally{await c.close();await s.close();}
}
const androidChannel=()=>{const a:any=channel();delete a.transport;for(const c of a.capabilities)Object.assign(c,{mechanism:'aidl',interfaceClass:'org.example.Device',servicePackage:'org.example.device',serviceClass:'DeviceService',methodName:'call'});return a;};

describe('generic contract projections and execution',()=>{
  it('uses identical static and MCP schemas, with action-specific required fields',async()=>{
    const a=channel();await session(a,async c=>{
      const listed=await c.listTools();expect(listed.tools).toEqual((mcpToolArtifact(a) as any).tools);
      expect(listed.tools).toHaveLength(1);
      const s:any=listed.tools[0].inputSchema;expect(s.oneOf).toHaveLength(2);
      expect(s.oneOf[0].properties.level).toEqual({type:'integer',minimum:0,maximum:100});
      expect(s.oneOf[0].properties.extras.properties.voiceZone.type).toBe('integer');
      const bundle:any=schemaArtifact(a,'all');expect(bundle.openai[0].function.parameters).toEqual(s);expect(bundle.anthropic[0].input_schema).toEqual(s);
      expect(bundle.bridge.functions[0].inputSchema).toEqual(s);
    });
  });
  it('rejects unknown actions, action/argument mismatches, bounds and undeclared context before dispatch',async()=>{
    let calls=0;await session(androidChannel(),async c=>{
      for(const args of [{action:'unknown'},{action:'adjust_level',enabled:true},{action:'adjust_level',level:101},{action:'set_power',enabled:'yes'},{action:'set_power',enabled:true,extras:{unknown:1}},{action:'set_power',enabled:true,extras:{voiceZone:-1}}]){
        const r=await c.callTool({name:'device_channelCall',arguments:args});expect(r.isError).toBe(true);
      }
      expect(calls).toBe(0);
    },async()=>{calls++;throw new Error('unexpected dispatch');});
  });
  it('maps public names and context without changing business codes or structured payloads',async()=>{
    let seen:any;await session(androidChannel(),async c=>{
      const r=await c.callTool({name:'device_channelCall',arguments:{action:'adjust_level',level:8,extras:{queryId:'q1',voiceZone:0,isAppPlayTts:true,source:'localAgent',sourceId:'host',callId:'c1'}}});
      expect(seen.op).toBe('set_level');expect(seen.args.intensity).toBe(8);expect(seen.args.extras.callId).toBe('c1');
      expect(r.isError).toBe(true);expect(resultBody(r)).toEqual({code:1400,message:'Out of range',data:{allowed:[0,100]},extras:{callId:'c1'}});
    },async(_:unknown,o:any)=>{seen=o;return {ok:false,data:{code:1400,message:'Out of range',data:{allowed:[0,100]},extras:{callId:'c1'}},error:'Out of range'};});
  });
  it('injects trusted host context and fails closed for missing preconditions',async()=>{
    const a:any=androidChannel();a.toolContract.contextBindings={sourceId:{env:'BRIDGE_TEST_CALLER'}};
    a.capabilities[0].preconditions=['ready'];process.env.BRIDGE_TEST_CALLER='trusted';let calls=0;
    try{
      await session(a,async c=>{const r=await c.callTool({name:'device_channelCall',arguments:{action:'adjust_level',level:8}});expect(r.isError).toBe(true);expect(calls).toBe(0);},async()=>{calls++;});
      await session(a,async c=>{const r=await c.callTool({name:'device_channelCall',arguments:{action:'adjust_level',level:8,extras:{sourceId:'spoof'}}});expect(r.isError).toBe(false);},async(_:unknown,o:any)=>{expect(o.args.extras.sourceId).toBe('trusted');return {ok:true,data:{code:0}};},{ready:true});
    }finally{delete process.env.BRIDGE_TEST_CALLER;}
  });
  it('executes a full MCP -> HTTP channel call and preserves nonzero error codes',async()=>{
    const received:any[]=[];const endpoint=createServer(async(req,res)=>{let body='';for await(const b of req)body+=b;const call=JSON.parse(body);received.push(call);res.setHeader('content-type','application/json');res.end(JSON.stringify({code:call.arguments.intensity===8?0:1401,message:'reply',data:{value:call.arguments.intensity},extras:call.arguments.extras}));});
    await new Promise<void>(resolve=>endpoint.listen(0,'127.0.0.1',resolve));
    try{const a:any=channel();a.transport.url=`http://127.0.0.1:${(endpoint.address() as any).port}/call`;
      await session(a,async c=>{for(const level of [8,9]){const r=await c.callTool({name:'device_channelCall',arguments:{action:'adjust_level',level,extras:{callId:'test'}}});expect(r.isError).toBe(level===9);expect(resultBody(r).code).toBe(level===8?0:1401);}});
      expect(received[0]).toEqual({name:'device_channelCall',arguments:{action:'set_level',intensity:8,extras:{callId:'test'}}});
    }finally{await new Promise<void>(resolve=>endpoint.close(()=>resolve()));}
  });
  it('keeps other applications independent and filters scope without adding media tools',()=>{
    const a:any=channel();a.app.name='inventory-service';a.toolContract={mode:'individual'};a.capabilities.push({...a.capabilities[0],id:'platform_level',scope:'platform'});
    expect((mcpToolArtifact(a) as any).tools.map((t:any)=>t.name)).toEqual(['set_level','set_power']);
    a.deliveryScopes=['core','platform'];expect((mcpToolArtifact(a) as any).tools).toHaveLength(3);
  });
  it('retains nested and array constraints in the friendly artifact',()=>{
    const a:any=channel();a.toolContract={};a.capabilities[0].params=[{name:'items',type:'List[int]',minItems:1,maxItems:3,items:{type:'integer',minimum:0,maximum:9}},{name:'config',type:'object',properties:[{name:'mode',type:'string',enum:['a','b']}],required:[]}];delete a.capabilities[0].dispatch;
    const artifact:any=schemaArtifact(a,'bridge');const args=artifact.functions[0].arguments;
    expect(args.items.type).toBe('List[int]');expect(args.items.items.maximum).toBe(9);expect(args.config.properties.mode.options).toEqual(['a','b']);
    expect((jsonSchemaFor(a.capabilities[0]) as any).properties.config.required).toBeUndefined();
  });
  it('rejects ambiguous and unsafe contracts consistently',()=>{
    for(const mutate of [(a:any)=>a.capabilities.push(a.capabilities[0]),(a:any)=>a.capabilities[0].params.push({name:'action',type:'string'}),(a:any)=>a.capabilities[0].dispatch.parameterMap.level='__proto__',(a:any)=>a.capabilities[0].params[0].maximum=-1,(a:any)=>a.toolContract.contextBindings={bad:{env:'ENV'}}]){
      const a=channel();mutate(a);expect(validateAnalysis(a).length).toBeGreaterThan(0);expect(()=>schemaArtifact(a,'all')).toThrow();
    }
  });
  it('does not accept undeclared success codes or missing required response codes',()=>{
    for(const code of [200,1000,1400])expect(normalizeResponse({ok:true,data:{code},reqId:'t',elapsedMs:0}).ok).toBe(false);
    expect(normalizeResponse({ok:true,data:{},reqId:'t',elapsedMs:0},{requireCode:true}).body.code).toBe('MISSING_RESPONSE_CODE');
    expect(normalizeResponse({ok:true,data:{status:200,payload:null},reqId:'t',elapsedMs:0},{successCodes:[200],codeField:'status',dataField:'payload'}).body.data).toBeNull();
    const failed=normalizeResponse({ok:false,data:{code:0,message:'success'},error:'HTTP_503',reqId:'t',elapsedMs:0});
    expect(failed.ok).toBe(false);expect(failed.body.code).toBe('BRIDGE_ERROR');expect(failed.body.message).toBe('HTTP_503');expect(failed.body.originalCode).toBe(0);
  });
  it('keeps unavailable and unselected capabilities out of executable requirements',()=>{
    const a:any=androidChannel();a.capabilities.push({id:'future_operation',description:'Planned integration',params:[],sourceRef:'spec',safetyLevel:'normal',status:'broken'});
    expect(validateAnalysis(a)).toEqual([]);expect((mcpToolArtifact(a) as any).tools[0].inputSchema.oneOf).toHaveLength(2);
  });
});
