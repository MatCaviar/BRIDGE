// 由 viz/gen.mjs 生成 (勿手改); 刷新: node viz/gen.mjs
window.__PIPELINE_DATA__ = {
 "generatedAt": "2026-09-10T09:08:32.481Z",
 "version": "0.2.0",
 "sources": {
  "analysis": "e2e/bridge-analysis.json",
  "functionSchema": "e2e/bridge-function-schema.json",
  "registry": "bridge-executor/registries/registry.json",
  "probe": ""
 },
 "title": {
  "input": "workspace-device-demo 应用源码",
  "output": "Agent Functions + MCP 工具套件"
 },
 "app": {
  "name": "workspace-device-demo",
  "framework": "http",
  "demo": true
 },
 "stats": {
  "totalCaps": 3,
  "verified": 0,
  "probe": 3,
  "broken": 0,
  "active": 3,
  "serveTools": 3,
  "functionSchemas": 3,
  "byMechanism": {
   "http": 3
  },
  "registryTools": 0
 },
 "capabilities": [
  {
   "id": "read_level",
   "domain": "device",
   "object": "level",
   "action": "read",
   "description": "Read the current level of the local demonstration device.",
   "params": [],
   "safetyLevel": "readonly",
   "status": "probe",
   "scope": "core",
   "sourceRef": "e2e/demo-device.mjs:read_level"
  },
  {
   "id": "set_level",
   "domain": "device",
   "object": "level",
   "action": "set",
   "description": "Set the local demonstration device level between 0 and 100.",
   "params": [
    {
     "name": "level",
     "type": "integer",
     "minimum": 0,
     "maximum": 100
    }
   ],
   "safetyLevel": "normal",
   "status": "probe",
   "scope": "core",
   "sourceRef": "e2e/demo-device.mjs:set_level"
  },
  {
   "id": "set_power",
   "domain": "device",
   "object": "power",
   "action": "set",
   "description": "Switch the local demonstration device on or off.",
   "params": [
    {
     "name": "enabled",
     "type": "boolean"
    }
   ],
   "safetyLevel": "normal",
   "status": "probe",
   "scope": "core",
   "sourceRef": "e2e/demo-device.mjs:set_power"
  }
 ],
 "prdCoverage": null,
 "mediaBuiltins": [],
 "registry": {
  "present": true,
  "tools": 0,
  "byMechanism": {},
  "entries": [],
  "missingFromRegistry": [],
  "extraInRegistry": []
 },
 "functionSchemaDeliverable": {
  "path": "e2e/bridge-function-schema.json",
  "count": 3,
  "schemaVersion": "bridge.function-schema/v1",
  "functions": [
   {
    "name": "read_level",
    "arguments": {},
    "description": "Read the current level of the local demonstration device.",
    "inputSchema": {
     "type": "object",
     "properties": {},
     "additionalProperties": false
    },
    "outputSchema": {
     "type": "object",
     "properties": {
      "code": {
       "type": [
        "number",
        "string"
       ]
      },
      "message": {
       "type": "string"
      },
      "data": {},
      "extras": {
       "type": "object"
      }
     },
     "required": [
      "code",
      "message",
      "data",
      "extras"
     ],
     "additionalProperties": true
    }
   },
   {
    "name": "set_level",
    "arguments": {
     "level": {
      "type": "int",
      "required": true,
      "schema": {
       "type": "integer",
       "minimum": 0,
       "maximum": 100
      },
      "minimum": 0,
      "maximum": 100
     }
    },
    "description": "Set the local demonstration device level between 0 and 100.",
    "inputSchema": {
     "type": "object",
     "properties": {
      "level": {
       "type": "integer",
       "minimum": 0,
       "maximum": 100
      }
     },
     "additionalProperties": false,
     "required": [
      "level"
     ]
    },
    "outputSchema": {
     "type": "object",
     "properties": {
      "code": {
       "type": [
        "number",
        "string"
       ]
      },
      "message": {
       "type": "string"
      },
      "data": {},
      "extras": {
       "type": "object"
      }
     },
     "required": [
      "code",
      "message",
      "data",
      "extras"
     ],
     "additionalProperties": true
    }
   },
   {
    "name": "set_power",
    "arguments": {
     "enabled": {
      "type": "bool",
      "required": true,
      "schema": {
       "type": "boolean"
      }
     }
    },
    "description": "Switch the local demonstration device on or off.",
    "inputSchema": {
     "type": "object",
     "properties": {
      "enabled": {
       "type": "boolean"
      }
     },
     "additionalProperties": false,
     "required": [
      "enabled"
     ]
    },
    "outputSchema": {
     "type": "object",
     "properties": {
      "code": {
       "type": [
        "number",
        "string"
       ]
      },
      "message": {
       "type": "string"
      },
      "data": {},
      "extras": {
       "type": "object"
      }
     },
     "required": [
      "code",
      "message",
      "data",
      "extras"
     ],
     "additionalProperties": true
    }
   }
  ]
 },
 "probe": {
  "present": false
 }
};
