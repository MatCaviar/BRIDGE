#!/usr/bin/env node
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
export function createDemoDevice() {
  let level = 50, enabled = false;
  return createServer(async (req,res) => {
    const respond = (code,message,data={},extras={}) => {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({code,message,data,extras}));};
    if(req.url === '/health') return respond(0,'simulation',{simulation:true,level,enabled});
    if(req.method !== 'POST' || req.url !== '/call') {res.statusCode=404;return respond(404,'Unknown endpoint');}
    try {
      let body='';for await(const part of req){body+=part;if(body.length>65536){res.statusCode=413;return respond(413,'Request too large');}}
      const call=JSON.parse(body), args=call.arguments ?? {}, action=args.action ?? call.name;
      if(action==='read_level') return respond(0,'success',{level,enabled,simulation:true},args.extras ?? {});
      if(action==='set_level') {
        const value=args.intensity ?? args.level;
        if(!Number.isInteger(value)||value<0||value>100) return respond(1400,'Level outside allowed range',{},args.extras ?? {});
        level=value;
      } else if(action==='set_power') {
        if(typeof args.enabled!=='boolean') return respond(1401,'Invalid power value',{},args.extras ?? {});
        enabled=args.enabled;
      } else return respond(1404,'Unknown action',{},args.extras ?? {});
      respond(0,'success',{level,enabled,simulation:true},args.extras ?? {});
    } catch {respond(1402,'Invalid request');}
  });
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const server=createDemoDevice();server.listen(Number(process.env.BRIDGE_DEMO_PORT||8766),'127.0.0.1',()=>console.log('BRIDGE local simulation ready'));
}
