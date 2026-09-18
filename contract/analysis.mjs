/** Shared, dependency-free contract validation used by the CLI and standalone validator. */
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const unsafe = new Set(['__proto__', 'prototype', 'constructor']);
const names = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const scopes = ['core', 'shared', 'platform'];
const media = ['media_next', 'media_prev', 'media_play', 'media_pause'];
export function validateAnalysis(a) {
  const errors = [];
  const fail = (at, message) => errors.push(`${at}: ${message}`);
  const fieldName = (s, at) => {
    if (typeof s !== 'string' || !s || unsafe.has(s)) fail(at, 'invalid or reserved field name');
  };
  const fields = (ps, at) => {
    if (!Array.isArray(ps)) { fail(at, 'expected parameter array'); return; }
    const seen = new Set();
    for (const [i, p] of ps.entries()) {
      const loc = `${at}[${i}]`;
      if (!plain(p)) { fail(loc, 'expected field object'); continue; }
      fieldName(p.name, loc);
      if (seen.has(p.name)) fail(loc, 'duplicate parameter');
      seen.add(p.name);
      field(p, loc);
      if (p.optional !== undefined && typeof p.optional !== 'boolean') fail(loc, 'optional must be boolean');
    if (p.presumed !== undefined && typeof p.presumed !== 'boolean') fail(loc, 'presumed must be boolean');
    }
  };
  const field = (p, at) => {
    if (!plain(p)) { fail(at, 'expected field object'); return; }
    const type = typeof p.type === 'string' ? p.type.toLowerCase().replace(/\s/g, '').replace(/\?$/, '') : '';
    if (!/^(string|str|int|integer|long|short|byte|uint|ulong|float|double|number|decimal|bool|boolean|object|map|record|dict|array|list|set)$/.test(type) && !/^(array|list|set)[<\[].+[>\]]$/.test(type) && !/^.+\[\]$/.test(type)) fail(at, `unsupported type ${p.type}`);
    if (p.enum !== undefined && (!Array.isArray(p.enum) || !p.enum.length || p.enum.some(v => !['string','number','boolean'].includes(typeof v)))) fail(at, 'enum must contain primitive values');
    for (const k of ['minimum','maximum','minLength','maxLength','minItems','maxItems']) {
      if (p[k] !== undefined && (typeof p[k] !== 'number' || !Number.isFinite(p[k]) || (k !== 'minimum' && k !== 'maximum' && (!Number.isInteger(p[k]) || p[k] < 0)))) fail(at, `invalid ${k}`);
    }
    for (const [lo,hi] of [['minimum','maximum'],['minLength','maxLength'],['minItems','maxItems']]) if (p[lo] !== undefined && p[hi] !== undefined && p[lo] > p[hi]) fail(at, `${lo} exceeds ${hi}`);
    if (p.pattern !== undefined) { try { new RegExp(p.pattern); } catch { fail(at, 'invalid pattern'); } }
    if (p.properties !== undefined) fields(p.properties, `${at}.properties`);
    if (p.items !== undefined) field(p.items, `${at}.items`);
    if (p.required !== undefined && (!Array.isArray(p.required) || p.required.some(n => !p.properties?.some(q => q.name === n)))) fail(at, 'required references undeclared fields');
    if (p.additionalProperties !== undefined && typeof p.additionalProperties !== 'boolean') fail(at, 'additionalProperties must be boolean');
  };
  if (!plain(a)) return ['analysis must be an object'];
  if (!plain(a.app) || typeof a.app.name !== 'string' || !a.app.name.trim()) fail('app', 'name is required');
  if (!Array.isArray(a.capabilities) || !a.capabilities.length) fail('capabilities', 'nonempty array required');
  const caps = Array.isArray(a.capabilities) ? a.capabilities : [];
  const contract = a.toolContract ?? {};
  if (!plain(contract)) return [...errors, 'toolContract must be an object'];
  if (contract.mode !== undefined && !['individual','channel'].includes(contract.mode)) fail('toolContract.mode', 'expected individual or channel');
  if (contract.mode === 'channel' && !names.test(contract.name ?? '')) fail('toolContract.name', 'channel needs a provider-safe tool name');
  const actionField = contract.actionField ?? 'action';
  const contextField = contract.contextField ?? 'extras';
  fieldName(actionField, 'toolContract.actionField'); fieldName(contextField, 'toolContract.contextField');
  if (actionField === contextField) fail('toolContract', 'action and context field names must differ');
  if (contract.version !== undefined && (typeof contract.version !== 'string' || !contract.version.trim())) fail('toolContract.version', 'expected nonempty string');
  if (contract.timeoutMs !== undefined && (!Number.isFinite(contract.timeoutMs) || contract.timeoutMs <= 0)) fail('toolContract.timeoutMs', 'positive timeout required');
  if (contract.clientPackage !== undefined && (typeof contract.clientPackage !== 'string' || !contract.clientPackage.trim())) fail('toolContract.clientPackage', 'expected nonempty string');
  if (contract.context !== undefined) fields(contract.context, 'toolContract.context');
  for (const [key,binding] of Object.entries(contract.contextBindings ?? {})) {
    if (!contract.context?.some(p => p.name === key)) fail('contextBindings', `${key} is undeclared`);
    if (!plain(binding) || typeof binding.env !== 'string' || !binding.env) fail('contextBindings', 'env variable name required');
  }
  const response = contract.response;
  if (response !== undefined) {
    if (!plain(response)) fail('toolContract.response', 'expected object');
    else {
      if (response.successCodes !== undefined && (!Array.isArray(response.successCodes) || !response.successCodes.length || response.successCodes.some(v => !['number','string'].includes(typeof v)))) fail('response.successCodes', 'nonempty string/number array required');
      if (response.errorCodes !== undefined) {
        if (!Array.isArray(response.errorCodes) || !response.errorCodes.length) fail('response.errorCodes', 'nonempty array required');
        else {
          const codes = new Set();
          for (const [i, e] of response.errorCodes.entries()) {
            const at = `response.errorCodes[${i}]`;
            if (!plain(e)) { fail(at, 'expected object'); continue; }
            if (!['string','number'].includes(typeof e.code) || e.code === '') fail(at, 'code must be a nonempty string/number');
            else {
              if (codes.has(String(e.code))) fail(at, 'duplicate error code');
              codes.add(String(e.code));
              if ((response.successCodes ?? []).some(s => String(s) === String(e.code))) fail(at, 'collides with successCodes');
            }
            if (typeof e.message !== 'string' || !e.message.trim()) fail(at, 'message required');
            if (e.description !== undefined && (typeof e.description !== 'string' || !e.description.trim())) fail(at, 'description must be a nonempty string');
          }
        }
      }
      for (const key of ['codeField','messageField','dataField','extrasField']) if (response[key] !== undefined) fieldName(response[key], `response.${key}`);
      if (response.requireCode !== undefined && typeof response.requireCode !== 'boolean') fail('response.requireCode', 'expected boolean');
    }
  }
  const ids = new Set(), actions = new Set();
  for (const [i,c] of caps.entries()) {
    const at = `capabilities[${i}]`;
    if (!plain(c)) { fail(at,'expected capability object'); continue; }
    if (!names.test(c.id ?? '') || unsafe.has(c.id)) fail(at, 'invalid tool id');
    if (ids.has(c.id)) fail(at,'duplicate id'); ids.add(c.id);
    if (!['verified','probe','broken'].includes(c.status)) fail(at,'status must be verified/probe/broken');
    for (const key of ['description','sourceRef','safetyLevel']) if (typeof c[key] !== 'string' || !c[key].trim()) fail(at, `${key} required`);
    if (c.scope !== undefined && !scopes.includes(c.scope)) fail(at,'invalid scope');
    if (c.utterances !== undefined && (!Array.isArray(c.utterances) || !c.utterances.length || c.utterances.some(u => typeof u !== 'string' || !u.trim()))) fail(at, 'utterances must be a nonempty array of nonempty strings');
    else if (c.utterances?.length && new Set(c.utterances).size !== c.utterances.length) fail(at, 'duplicate utterance');
    if (c.presumed !== undefined && typeof c.presumed !== 'boolean') fail(at, 'presumed must be boolean');
    fields(c.params ?? [], `${at}.params`);
    const action = c.publicAction ?? c.id;
    if (typeof action !== 'string' || !action) fail(at, 'publicAction must be nonempty string');
    if (contract.mode === 'channel' && actions.has(action)) fail(at,'duplicate channel action'); actions.add(action);
    if ((c.params ?? []).some(p => (contract.mode === 'channel' && p.name === actionField) || (contract.context?.length && p.name === contextField))) fail(at,'business parameter collides with contract field');
    const targets = new Set();
    for (const [key,value] of Object.entries(c.dispatch?.parameterMap ?? {})) {
      if (!c.params?.some(p=>p.name===key)) fail(at,`parameterMap source ${key} is undeclared`);
      fieldName(value, `${at}.parameterMap`);
    }
    for (const p of c.params ?? []) {
      const target = c.dispatch?.parameterMap?.[p.name] ?? p.name;
      if (targets.has(target)) fail(at,'parameterMap targets collide');
      if ((contract.mode === 'channel' && target === actionField) || (contract.context?.length && target === contextField)) fail(at,'mapped parameter collides with contract field');
      targets.add(target);
    }
    if (c.dispatch?.operation !== undefined && (typeof c.dispatch.operation !== 'string' || !c.dispatch.operation)) fail(at,'dispatch.operation must be nonempty string');
    if (c.preconditions !== undefined && (!Array.isArray(c.preconditions) || c.preconditions.some(p=>typeof p!=='string'||!p))) fail(at,'preconditions must be an array of names');
    if (!a.transport && c.status !== 'broken' && (a.deliveryScopes ?? ['core']).includes(c.scope ?? 'core')) {
      for (const key of ['devicePaths','dataClass','form','intentScreens','defaultArgs','ccDomain','ccFunction']) if (c[key] !== undefined) fail(at, `${key} needs an external application adapter`);
      if (c.pattern !== undefined && !['none','json'].includes(c.pattern)) fail(at, 'aidl pattern must be none or json; other signatures need an external adapter');
      if (!['aidl','execmd','intent','media'].includes(c.mechanism)) fail(at,'supported executor mechanism required');
      if (['aidl','execmd'].includes(c.mechanism)) {
        for (const key of ['servicePackage','serviceClass','methodName']) if (typeof c[key] !== 'string'||!c[key]) fail(at, `${key} required`);
        if (c.mechanism==='aidl' && !c.interfaceClass) fail(at,'interfaceClass required');
        if (c.mechanism==='execmd') {
          if (!plain(c.binder)) fail(at,'execmd requires binder configuration');
          else {
            for(const key of ['descriptor','callbackDescriptor']) if(typeof c.binder[key]!=='string'||!c.binder[key]) fail(at,`binder.${key} required`);
            for(const key of ['transactionCode','callbackTransactionCode']) if(!Number.isInteger(c.binder[key])||c.binder[key]<1) fail(at,`binder.${key} must be positive integer`);
          }
        }
      }
      if (c.mechanism==='intent' && (!plain(c.component)||!c.component.pkg||!c.component.cls)) fail(at,'intent component pkg/cls required');
      if (c.mechanism==='media' && !['next','prev','play','pause'].includes(c.methodName)) fail(at,'unsupported media methodName');
    }
  }
  if (a.builtins !== undefined && (!Array.isArray(a.builtins) || a.builtins.some(n=>!media.includes(n)) || new Set(a.builtins).size !== a.builtins.length)) fail('builtins','invalid/duplicate builtin');
  if (a.builtins?.some(n=>ids.has(n))) fail('builtins','builtin duplicates a capability id');
  if (contract.mode === 'channel' && a.builtins?.length) fail('builtins','declare media capabilities explicitly for channel mode');
  if (a.deliveryScopes !== undefined && (!Array.isArray(a.deliveryScopes) || !a.deliveryScopes.length || a.deliveryScopes.some(s=>!scopes.includes(s)))) fail('deliveryScopes','invalid scope selection');
  // Channel needs something to expose; PRD-only drafts (all capabilities broken) stay valid here —
  // they export only with --include-broken for review, and serve/call still block broken execution.
  if (contract.mode === 'channel' && !caps.some(c => (a.deliveryScopes ?? ['core']).includes(c?.scope ?? 'core'))) fail('toolContract','channel requires a selected capability');
  if (a.transport !== undefined) {
    if (a.builtins?.length) fail('builtins','HTTP adapters must declare their capabilities explicitly');
    if (a.transport.type !== 'http') fail('transport','unsupported transport');
    try { if (!['http:','https:'].includes(new URL(a.transport.url).protocol)) throw 0; } catch { fail('transport.url','absolute http(s) URL required'); }
    if (a.transport.timeoutMs !== undefined && (!Number.isFinite(a.transport.timeoutMs) || a.transport.timeoutMs <= 0)) fail('transport.timeoutMs','positive timeout required');
    if (a.transport.headerEnv !== undefined) {
      if (!plain(a.transport.headerEnv)) fail('transport.headerEnv','expected header to environment-variable mapping');
      else for (const [key,value] of Object.entries(a.transport.headerEnv)) if (!/^[A-Za-z0-9-]+$/.test(key) || typeof value !== 'string' || !value) fail('transport.headerEnv','invalid header or variable name');
    }
  }
  return errors;
}
export function assertAnalysis(a) {
  const errors = validateAnalysis(a);
  if (errors.length) throw new Error(errors.join('\n'));
}
