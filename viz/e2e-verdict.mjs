/** Match requested argument subsets, including nested channel context. */
export function matchesArguments(actual, expected) {
  if (expected === null || typeof expected !== 'object') return actual === expected;
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((v,i)=>matchesArguments(actual[i],v));
  return !!actual && typeof actual === 'object' && Object.entries(expected).every(([k,v])=>Object.hasOwn(actual,k)&&matchesArguments(actual[k],v));
}
export function createTestResult(message, expectTool='', expectArgs) {
  return {message,expect:expectTool,expectArgs,called:[],calls:[],errors:[],final:'',completed:false,selectionPass:false,executionPass:false,pass:false};
}
export function recordTestEvent(out,ev) {
  if(ev.type==='tool_call_started'){
    out.called.push(ev.toolName);
    out.calls.push({id:ev.callId,name:ev.toolName,arguments:ev.arguments??{},status:'running'});
  }
  if(ev.type==='tool_call_completed'||ev.type==='tool_call_error'){
    const c=out.calls.find(c=>c.id===ev.callId);
    if(c){c.status=ev.type==='tool_call_completed'?'completed':'error';c.result=ev.resultFull;c.error=ev.error;}
    if(ev.type==='tool_call_error')out.errors.push(String(ev.error??'Tool failed'));
  }
  if(ev.type==='session_completed'){out.completed=true;out.final=String(ev.finalText??'');}
  if(ev.type==='session_error'){out.errors.push(String(ev.error??'Session failed'));out.final='会话错误: '+String(ev.error??'');}
}
export function finishTestResult(out) {
  out.selectionPass=out.expect==='none'?out.calls.length===0:(!out.expect&&!out.expectArgs)||out.calls.some(c=>(!out.expect||c.name===out.expect)&&(!out.expectArgs||matchesArguments(c.arguments,out.expectArgs)));
  out.executionPass=out.completed&&out.errors.length===0&&out.calls.every(c=>c.status==='completed');
  out.pass=out.selectionPass&&out.executionPass;
  return out;
}
