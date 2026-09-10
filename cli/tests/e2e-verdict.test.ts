import {describe,it,expect} from 'vitest';
import {createTestResult,recordTestEvent,finishTestResult} from '../../viz/e2e-verdict.mjs';
const start={type:'tool_call_started',callId:'c1',toolName:'device_channelCall',arguments:{action:'adjust_level',level:35}};
describe('E2E selection and execution verdict',()=>{
  it('requires action and business arguments, not only the shared channel name',()=>{
    const out=createTestResult('set','device_channelCall',{action:'set_power'});
    recordTestEvent(out,start);recordTestEvent(out,{type:'tool_call_completed',callId:'c1'});recordTestEvent(out,{type:'session_completed'});
    expect(finishTestResult(out)).toMatchObject({pass:false,selectionPass:false,executionPass:true});
  });
  it('reports a business error as execution failure even after correct selection',()=>{
    const out=createTestResult('set','device_channelCall',{action:'adjust_level',level:35});
    recordTestEvent(out,start);recordTestEvent(out,{type:'tool_call_error',callId:'c1',error:'1400'});recordTestEvent(out,{type:'session_completed'});
    expect(finishTestResult(out)).toMatchObject({pass:false,selectionPass:true,executionPass:false});
  });
  it('passes only a completed session and matching successful call',()=>{
    const out=createTestResult('set','device_channelCall',{action:'adjust_level',level:35});recordTestEvent(out,start);
    recordTestEvent(out,{type:'tool_call_completed',callId:'c1'});expect(finishTestResult(out).pass).toBe(false);
    recordTestEvent(out,{type:'session_completed'});expect(finishTestResult(out).pass).toBe(true);
  });
  it('does not mark failed no-tool sessions as a pass',()=>{
    const out=createTestResult('unrelated','none');recordTestEvent(out,{type:'session_error',error:'provider down'});
    expect(finishTestResult(out).pass).toBe(false);
  });
});
