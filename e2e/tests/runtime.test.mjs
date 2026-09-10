import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {createDemoDevice} from '../demo-device.mjs';
import {McpConnector,ToolExecutionError,toolErrorContent} from '../dist/mcp/connector.js';

const run=promisify(execFile);
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const cli=join(root,'cli/bin/mcp-pipeline.js');

test('real stdio gateway → public contract → HTTP simulation',async t=>{
  const work=mkdtempSync(join(root,'e2e/.runtime-test-'));
  const backend=createDemoDevice();backend.listen(0,'127.0.0.1');await once(backend,'listening');
  const url=`http://127.0.0.1:${backend.address().port}/call`;
  const load=name=>JSON.parse(readFileSync(join(root,name),'utf8'));
  const individual=load('e2e/bridge-analysis.json');individual.transport.url=url;
  const channel=load('examples/channel-analysis.json');channel.transport.url=url;
  // Intentionally broader public range to exercise a backend business rejection.
  channel.capabilities[0].params[0].maximum=200;
  const individualPath=join(work,'individual.json'),channelPath=join(work,'channel.json');
  writeFileSync(individualPath,JSON.stringify(individual));writeFileSync(channelPath,JSON.stringify(channel));
  const connector=new McpConnector([{name:'bridge',transport:'stdio',command:process.execPath,cwd:work,
    args:[join(root,'e2e/bridge-serve-wrapper.mjs'),'--',cli,'serve','--analysis',channelPath]}]);
  try {
    await t.test('discovers only one configured channel without ADB or implicit media',async()=>{
      await connector.connectAll();const tools=connector.getToolDefinitions();assert.equal(tools.length,1);assert.equal(tools[0].name,'device_channelCall');assert.equal(tools[0].inputSchema.oneOf.length,2);
    });
    await t.test('executes a channel branch and returns structured context',async()=>{
      const reply=await connector.executeTool('bridge','device_channelCall',{action:'adjust_level',level:35,extras:{callId:'smoke-1'}});
      assert.equal(reply.code,0);assert.equal(reply.data.level,35);assert.equal(reply.data.simulation,true);assert.equal(reply.extras.callId,'smoke-1');
    });
    await t.test('preserves backend error codes for the upstream agent',async()=>{
      await assert.rejects(()=>connector.executeTool('bridge','device_channelCall',{action:'adjust_level',level:150}),error=>{
        assert.ok(error instanceof ToolExecutionError);assert.equal(error.result.code,1400);assert.equal(JSON.parse(toolErrorContent(error)).code,1400);return true;
      });
    });
    await t.test('rejects wrong channel parameters before changing backend state',async()=>{
      await assert.rejects(()=>connector.executeTool('bridge','device_channelCall',{action:'set_power',level:5}),error=>error.result?.code==='INVALID_ARGUMENTS');
      const state=await (await fetch(url.replace('/call','/health'))).json();assert.equal(state.data.enabled,false);assert.equal(state.data.level,35);
    });
    await t.test('CLI call uses the same contract from an unrelated working directory',async()=>{
      const {stdout}=await run(process.execPath,[cli,'call','--analysis',individualPath,'--op','set_power','--args','{"enabled":true}'],{cwd:work,windowsHide:true});
      assert.equal(JSON.parse(stdout).data.enabled,true);
      const r=await run(process.execPath,[cli,'call','--analysis',individualPath,'--op','read_level'],{cwd:work,windowsHide:true});assert.equal(JSON.parse(r.stdout).data.level,35);
    });
  } finally {await connector.disconnect();backend.closeAllConnections();await new Promise(r=>backend.close(r));rmSync(work,{recursive:true,force:true});}
});
