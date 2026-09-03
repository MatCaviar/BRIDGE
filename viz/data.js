// 由 viz/gen.mjs 生成 (勿手改); 刷新: node viz/gen.mjs
window.__PIPELINE_DATA__ = {
 "generatedAt": "2026-09-03T01:56:46.835Z",
 "version": "0.1.25",
 "sources": {
  "analysis": "e2e/bridge-analysis.json",
  "functionSchema": "e2e/bridge-function-schema.json",
  "registry": "bridge-executor/registries/registry.json",
  "probe": "tmp/car-backup/probe-full-results.json"
 },
 "title": {
  "input": "bridge 应用源码",
  "output": "Agent Functions + MCP 工具套件"
 },
 "app": {
  "name": "bridge",
  "framework": "android-kotlin",
  "deviceSources": [
   "vin"
  ],
  "corePurpose": "imaudio 车机音频应用: 音场/均衡/音效库/音量/媒体播控与相关页面直达"
 },
 "stats": {
  "totalCaps": 36,
  "verified": 27,
  "probe": 7,
  "broken": 2,
  "active": 34,
  "serveTools": 38,
  "functionSchemas": 38,
  "byMechanism": {
   "execmd": 23,
   "mapnav": 1,
   "carcontrol": 5,
   "intent": 7
  },
  "registryTools": 34
 },
 "capabilities": [
  {
   "id": "get_sound_stage",
   "domain": "imaudio",
   "object": "sound_stage",
   "action": "get",
   "safetyLevel": "readonly",
   "status": "verified",
   "sourceRef": "IMAudioServiceAdapter.kt:getSoundStage",
   "description": "查询当前音场模式(主驾优先/沉浸环绕等)、fade 前后声场偏移、balance 左右平衡。用户问'现在是什么音场'时用。",
   "params": [],
   "mechanism": "execmd",
   "methodName": "getSoundStage",
   "pattern": "none",
   "form": "binder",
   "servicePackage": "com.immotors.imaudio",
   "serviceClass": "com.immotors.imaudio_service.IMAudioService",
   "bindAction": "com.immotors.imaudio_service.ACTION_BIND",
   "scope": "core",
   "deliverNote": "core 能力; 实车 verified; PRD 未提及, 超出范围"
  },
  {
   "id": "set_sound_stage",
   "domain": "imaudio",
   "object": "sound_stage",
   "action": "set",
   "safetyLevel": "normal",
   "status": "verified",
   "sourceRef": "IMAudioServiceAdapter.kt:setSoundStage",
   "description": "切换音场模式: 0=至臻原声(自定义) 1=专业听音室 2=小型演奏会 3=音乐剧场 4=沉浸影院 7=主驾优先 8=后排优先 9=全车均衡 10=全景影院 235=AI莱茵之声 236=AI极光暖调 237=AI英伦格调 238=AI美式金属。用户说'把音场调到XX/切换音场'时用。",
   "params": [
    {
     "name": "mode",
     "type": "int",
     "optional": false,
     "description": "音场模式编号(见描述)",
     "enum": [
      "0",
      "1",
      "2",
      "3",
      "4",
      "7",
      "8",
      "9",
      "10",
      "235",
      "236",
      "237",
      "238"
     ]
    },
    {
     "name": "fade",
     "type": "int",
     "optional": true,
     "description": "前后声场偏移, 省略保持当前"
    },
    {
     "name": "balance",
     "type": "int",
     "optional": true,
     "description": "左右平衡, 省略保持当前"
    }
   ],
   "mechanism": "execmd",
   "methodName": "setSoundStage",
   "pattern": "dataclass",
   "dataClass": "EffectModeAndFB",
   "form": "binder",
   "servicePackage": "com.immotors.imaudio",
   "serviceClass": "com.immotors.imaudio_service.IMAudioService",
   "bindAction": "com.immotors.imaudio_service.ACTION_BIND",
   "scope": "core",
   "deliverNote": "PRD 3.2 全覆盖(13 档含 AI 音场); wire 枚举经 dex 溯源"
  },
  {
   "id": "set_beosonic_point",
   "domain": "imaudio",
   "object": "beosonic",
   "action": "set",
   "safetyLevel": "normal",
   "status": "verified",
   "sourceRef": "IMAudioServiceAdapter.kt:setBeosonicPoint",
   "description": "设置 Beosonic 三维均衡点(x 0-20 亮音-暖音, y 0-20 柔和-活力, z 0-10 空间感)。用户调均衡器/音质时用。",
   "params": [
    {
     "name": "x",
     "type": "int",
     "optional": false,
     "description": "x 轴 0-20(亮音→暖音)"
    },
    {
     "name": "y",
     "type": "int",
     "optional": false,
     "description": "y 轴 0-20(柔和→活力)"
    },
    {
     "name": "z",
     "type": "int",
     "optional": false,
     "description": "z 轴 0-10(空间感)"
    }
   ],
   "mechanism": "execmd",
   "methodName": "setBeosonicPoint",
   "pattern": "dataclass",
   "dataClass": "BeosonicPoint",
   "form": "binder",
   "servicePackage": "com.immotors.imaudio",
   "serviceClass": "com.immotors.imaudio_service.IMAudioService",
   "bindAction": "com.immotors.imaudio_service.ACTION_BIND",
   "scope": "core",
   "deliverNote": "core 能力; 实车 verified; PRD 未提及, 超出范围"
  },
  {
   "id": "get_mic_vocal",
   "domain": "imaudio",
   "object": "mic",
   "action": "get",
   "safetyLevel": "readonly",
   "status": "verified",
   "sourceRef": "IMAudioServiceAdapter.kt:getMicVocal",
   "description": "查询当前麦克风音量。用户问\"麦克风音量多少\"时用。",
   "params": [],
   "mechanism": "execmd",
   "methodName": "getMicVocal",
   "pattern": "none",
   "form": "binder",
   "servicePackage": "com.immotors.imaudio",
   "serviceClass": "com.immotors.imaudio_service.IMAudioService",
   "bindAction": "com.immotors.imaudio_service.ACTION_BIND",
   "scope": "core",
   "deliverNote": "core 能力; 实车 verified; PRD 未提及, 超出范围"
  },
  {
   "id": "set_mic_vocal",
   "domain": "imaudio",
   "object": "mic",
   "action": "set",
   "safetyLevel": "normal",
   "status": "verified",
   "sourceRef": "IMAudioServiceAdapter.kt:setMicVocal",
   "description": "设置麦克风音量(vol 0-31)。用户说\"把麦克风音量调到X\"时用。",
   "params": [
    {
     "name": "vol",
     "type": "int",
     "optional": false,
     "description": "麦克风音量 0-31"
    }
   ],
   "mechanism": "execmd",
   "methodName": "setMicVocal",
   "pattern": "scalar",
   "form": "binder",
   "servicePackage": "com.immotors.imaudio",
   "serviceClass": "com.immotors.imaudio_service.IMAudioService",
   "bindAction": "com.immotors.imaudio_service.ACTION_BIND",
   "scope": "core",
   "deliverNote": "core 能力; 实车 verified; PRD 未提及, 超出范围"
  },
  {
   "id": "get_fast_audio_mode",
   "domain": "imaudio",
   "object": "fast_audio",
   "action": "get",
   "safetyLevel": "readonly",
   "status": "verified",
   "sourceRef": "IMAudioServiceAdapter.kt:getFastAudioMode",
   "description": "查询当前 K歌混响模式(普通/录音棚/K歌房)。用户问\"现在是什么K歌模式\"时用。",
   "params": [],
   "mechanism": "execmd",
   "methodName": "getFastAudioMode",
   "pattern": "none",
   "form": "binder",
   "servicePackage": "com.immotors.imaudio",
   "serviceClass": "com.immotors.imaudio_service.IMAudioService",
   "bindAction": "com.immotors.imaudio_service.ACTION_BIND",
   "scope": "core",
   "deliverNote": "core 能力; 实车 verified; PRD 未提及, 超出范围"
  },
  {
   "id": "set_fast_audio_mode",
   "domain": "imaudio",
   "object": "fast_audio",
   "action": "set",
   "safetyLevel": "normal",
   "status": "verified",
   "sourceRef": "IMAudioServiceAdapter.kt:setFastAudioMode",
   "description": "设置 K歌混响模式: 0=普通 1=录音棚 2=K歌房。用户说'开录音棚模式/K歌房模式'时用。",
   "params": [
    {
     "name": "mode",
     "type": "int",
     "optional": false,
     "description": "0=普通 1=录音棚 2=K歌房",
     "enum": [
      "0",
      "1",
      "2"
     ]
    }
   ],
   "mechanism": "execmd",
   "methodName": "setFastAudioMode",
   "pattern": "scalar",
   "form": "binder",
   "servicePackage": "com.immotors.imaudio",
   "serviceClass": "com.immotors.imaudio_service.IMAudioService",
   "bindAction": "com.immotors.imaudio_service.ACTION_BIND",
   "scope": "core",
   "deliverNote": "core 能力; 实车 verified; PRD 未提及, 超出范围"
  },
  {
   "id": "set_car_and_headrest_volume",
   "domain": "imaudio",
   "object": "volume",
   "action": "set",
   "safetyLevel": "normal",
   "status": "verified",
   "sourceRef": "IMAudioServiceAdapter.kt:setCarAndHeadrestVolume",
   "description": "设置整车+头枕音量(volume 音量值, streamType 0=媒体流)。用户说'音量调到XX'时用, 这是调音量的核心工具。",
   "params": [
    {
     "name": "volume",
     "type": "int",
     "optional": false,
     "description": "音量值(建议 0-31)"
    },
    {
     "name": "streamType",
     "type": "int",
     "optional": true,
     "description": "音频流类型, 默认 0(媒体)"
    },
    {
     "name": "zoneId",
     "type": "int",
     "optional": true,
     "description": "区域, 省略默认"
    }
   ],
   "mechanism": "execmd",
   "methodName": "setCarAndHeadrestVolume",
   "pattern": "scalar",
   "form": "binder",
   "servicePackage": "com.immotors.imaudio",
   "serviceClass": "com.immotors.imaudio_service.IMAudioService",
   "bindAction": "com.immotors.imaudio_service.ACTION_BIND",
   "scope": "core",
   "deliverNote": "PRD 3.1 覆盖; 头枕音区可选参数"
  },
  {
   "id": "get_last_volume_data",
   "domain": "imaudio",
   "object": "volume",
   "action": "get",
   "safetyLevel": "readonly",
   "status": "verified",
   "sourceRef": "IMAudioServiceAdapter.kt:getLastVolumeData",
   "description": "查询上次设置的音量数据(streamType 默认0=媒体)。用户问\"现在音量多少\"时用。",
   "params": [
    {
     "name": "streamType",
     "type": "int",
     "optional": true,
     "description": "音频流类型, 默认 0"
    }
   ],
   "mechanism": "execmd",
   "methodName": "getLastVolumeData",
   "pattern": "scalar",
   "form": "binder",
   "servicePackage": "com.immotors.imaudio",
   "serviceClass": "com.immotors.imaudio_service.IMAudioService",
   "bindAction": "com.immotors.imaudio_service.ACTION_BIND",
   "scope": "core",
   "deliverNote": "core 能力; 实车 verified; PRD 未提及, 超出范围"
  },
  {
   "id": "query_current_active_sound",
   "domain": "imaudio",
   "object": "sound",
   "action": "query_active",
   "safetyLevel": "readonly",
   "status": "verified",
   "sourceRef": "IMAudioServiceAdapter.kt:queryCurrentActiveSound",
   "description": "查询当前激活的解闭锁声音(默认/自定义)。",
   "params": [],
   "mechanism": "execmd",
   "methodName": "queryCurrentActiveSound",
   "pattern": "none",
   "form": "binder",
   "servicePackage": "com.immotors.imaudio",
   "serviceClass": "com.immotors.imaudio_service.IMAudioService",
   "bindAction": "com.immotors.imaudio_service.ACTION_BIND",
   "scope": "core",
   "deliverNote": "core 能力; 实车 verified; PRD 未提及, 超出范围"
  },
  {
   "id": "query_sound_library",
   "domain": "imaudio",
   "object": "sound",
   "action": "query_library",
   "safetyLevel": "readonly",
   "status": "verified",
   "sourceRef": "IMAudioServiceAdapter.kt:querySoundLibrary",
   "description": "查询解闭锁音效库列表(分页 pageNum/pageSize)。用户说\"看看有哪些音效/音效库\"时用。",
   "params": [
    {
     "name": "pageNum",
     "type": "int",
     "optional": true,
     "description": "页码, 默认1"
    },
    {
     "name": "pageSize",
     "type": "int",
     "optional": true,
     "description": "每页数量, 默认5"
    }
   ],
   "mechanism": "execmd",
   "methodName": "querySoundLibrary",
   "pattern": "envelope",
   "devicePaths": [
    "body.vin"
   ],
   "form": "binder",
   "servicePackage": "com.immotors.imaudio",
   "serviceClass": "com.immotors.imaudio_service.IMAudioService",
   "bindAction": "com.immotors.imaudio_service.ACTION_BIND",
   "scope": "core",
   "deliverNote": "core 能力; 实车 verified; PRD 未提及, 超出范围"
  },
  {
   "id": "install_sound_library",
   "domain": "imaudio",
   "object": "sound",
   "action": "install",
   "safetyLevel": "normal",
   "status": "verified",
   "sourceRef": "IMAudioServiceAdapter.kt:installSoundLibrary",
   "description": "下载安装音效资源(resourceCode, 如 default)。用户说\"下载/安装这个音效\"时用。",
   "params": [
    {
     "name": "resourceCode",
     "type": "string",
     "optional": false,
     "description": "音效资源 code"
    }
   ],
   "mechanism": "execmd",
   "methodName": "installSoundLibrary",
   "pattern": "envelope",
   "devicePaths": [
    "body.vin"
   ],
   "form": "binder",
   "servicePackage": "com.immotors.imaudio",
   "serviceClass": "com.immotors.imaudio_service.IMAudioService",
   "bindAction": "com.immotors.imaudio_service.ACTION_BIND",
   "scope": "core",
   "deliverNote": "core 能力; 实车 verified; PRD 未提及, 超出范围"
  },
  {
   "id": "preview_sound",
   "domain": "imaudio",
   "object": "sound",
   "action": "preview",
   "safetyLevel": "normal",
   "status": "verified",
   "sourceRef": "IMAudioServiceAdapter.kt:previewSound",
   "description": "预览音效(resourceCode; voiceType 0=解锁 1=闭锁)。用户说\"试听这个音效\"时用。",
   "params": [
    {
     "name": "resourceCode",
     "type": "string",
     "optional": false,
     "description": "音效资源 code"
    },
    {
     "name": "voiceType",
     "type": "int",
     "optional": true,
     "description": "0=解锁 1=闭锁"
    }
   ],
   "mechanism": "execmd",
   "methodName": "previewSound",
   "pattern": "envelope",
   "devicePaths": [
    "body.vin"
   ],
   "form": "binder",
   "servicePackage": "com.immotors.imaudio",
   "serviceClass": "com.immotors.imaudio_service.IMAudioService",
   "bindAction": "com.immotors.imaudio_service.ACTION_BIND",
   "scope": "core",
   "deliverNote": "PRD 3.4 覆盖试听; 结果经回调异步"
  },
  {
   "id": "query_effect_library",
   "domain": "imaudio",
   "object": "effect",
   "action": "query",
   "safetyLevel": "readonly",
   "status": "verified",
   "sourceRef": "IMAudioServiceAdapter.kt:queryEffectLibrary",
   "description": "查询均衡器效果库(sourceType 0=官方 1=自定义)。用户说\"有哪些均衡器效果\"时用。",
   "params": [
    {
     "name": "sourceType",
     "type": "int",
     "optional": false,
     "description": "0=官方 1=自定义",
     "enum": [
      "0",
      "1"
     ]
    }
   ],
   "mechanism": "execmd",
   "methodName": "queryEffectLibrary",
   "pattern": "dataclass",
   "dataClass": "EffectRequest",
   "form": "binder",
   "servicePackage": "com.immotors.imaudio",
   "serviceClass": "com.immotors.imaudio_service.IMAudioService",
   "bindAction": "com.immotors.imaudio_service.ACTION_BIND",
   "scope": "core",
   "deliverNote": "core 能力; 实车 verified; PRD 未提及, 超出范围"
  },
  {
   "id": "add_effect",
   "domain": "imaudio",
   "object": "effect",
   "action": "add",
   "safetyLevel": "normal",
   "status": "verified",
   "sourceRef": "IMAudioServiceAdapter.kt:addEffect",
   "description": "添加自定义均衡器效果(name 名称 + effectValues 均衡值数组)。用户说\"新建一个均衡器效果\"时用。",
   "params": [
    {
     "name": "name",
     "type": "string",
     "optional": false,
     "description": "效果名称"
    },
    {
     "name": "effectValues",
     "type": "array",
     "optional": true,
     "description": "均衡值数组"
    }
   ],
   "mechanism": "execmd",
   "methodName": "addEffect",
   "pattern": "envelope",
   "form": "binder",
   "servicePackage": "com.immotors.imaudio",
   "serviceClass": "com.immotors.imaudio_service.IMAudioService",
   "bindAction": "com.immotors.imaudio_service.ACTION_BIND",
   "scope": "core",
   "deliverNote": "core 能力; 实车 verified; PRD 未提及, 超出范围"
  },
  {
   "id": "update_effect",
   "domain": "imaudio",
   "object": "effect",
   "action": "update",
   "safetyLevel": "normal",
   "status": "verified",
   "sourceRef": "IMAudioServiceAdapter.kt:updateEffect",
   "description": "更新自定义均衡器效果(effectId + name)。用户说\"修改均衡器效果\"时用。",
   "params": [
    {
     "name": "effectId",
     "type": "string",
     "optional": false,
     "description": "效果 id"
    },
    {
     "name": "name",
     "type": "string",
     "optional": true,
     "description": "效果名称"
    }
   ],
   "mechanism": "execmd",
   "methodName": "updateEffect",
   "pattern": "envelope",
   "form": "binder",
   "servicePackage": "com.immotors.imaudio",
   "serviceClass": "com.immotors.imaudio_service.IMAudioService",
   "bindAction": "com.immotors.imaudio_service.ACTION_BIND",
   "scope": "core",
   "deliverNote": "core 能力; 实车 verified; PRD 未提及, 超出范围"
  },
  {
   "id": "delete_effect",
   "domain": "imaudio",
   "object": "effect",
   "action": "delete",
   "safetyLevel": "normal",
   "status": "verified",
   "sourceRef": "IMAudioServiceAdapter.kt:deleteEffect",
   "description": "删除自定义均衡器效果(effectId)。用户说\"删除这个均衡器效果\"时用。",
   "params": [
    {
     "name": "effectId",
     "type": "string",
     "optional": false,
     "description": "效果 id"
    }
   ],
   "mechanism": "execmd",
   "methodName": "deleteEffect",
   "pattern": "envelope",
   "form": "binder",
   "servicePackage": "com.immotors.imaudio",
   "serviceClass": "com.immotors.imaudio_service.IMAudioService",
   "bindAction": "com.immotors.imaudio_service.ACTION_BIND",
   "scope": "core",
   "deliverNote": "core 能力; 实车 verified; PRD 未提及, 超出范围"
  },
  {
   "id": "get_effect_share_code",
   "domain": "imaudio",
   "object": "effect",
   "action": "get_share_code",
   "safetyLevel": "readonly",
   "status": "verified",
   "sourceRef": "IMAudioServiceAdapter.kt:getEffectShareCode",
   "description": "获取均衡器效果的分享码(effectId)。用户说\"分享这个均衡器\"时用。",
   "params": [
    {
     "name": "effectId",
     "type": "string",
     "optional": false,
     "description": "效果 id"
    }
   ],
   "mechanism": "execmd",
   "methodName": "getEffectShareCode",
   "pattern": "envelope",
   "form": "binder",
   "servicePackage": "com.immotors.imaudio",
   "serviceClass": "com.immotors.imaudio_service.IMAudioService",
   "bindAction": "com.immotors.imaudio_service.ACTION_BIND",
   "scope": "core",
   "deliverNote": "core 能力; 实车 verified; PRD 未提及, 超出范围"
  },
  {
   "id": "add_effect_by_share_code",
   "domain": "imaudio",
   "object": "effect",
   "action": "add_by_share_code",
   "safetyLevel": "normal",
   "status": "verified",
   "sourceRef": "IMAudioServiceAdapter.kt:addEffectByShareCode",
   "description": "通过分享码添加均衡器效果(shareCode)。用户说\"用分享码添加均衡器\"时用。",
   "params": [
    {
     "name": "shareCode",
     "type": "string",
     "optional": false,
     "description": "分享码"
    }
   ],
   "mechanism": "execmd",
   "methodName": "addEffectByShareCode",
   "pattern": "envelope",
   "form": "binder",
   "servicePackage": "com.immotors.imaudio",
   "serviceClass": "com.immotors.imaudio_service.IMAudioService",
   "bindAction": "com.immotors.imaudio_service.ACTION_BIND",
   "scope": "core",
   "deliverNote": "core 能力; 实车 verified; PRD 未提及, 超出范围"
  },
  {
   "id": "save_current_effect_data",
   "domain": "imaudio",
   "object": "effect",
   "action": "save",
   "safetyLevel": "normal",
   "status": "verified",
   "sourceRef": "IMAudioServiceAdapter.kt:saveCurrentEffectData",
   "description": "保存当前均衡器效果数据。用户说\"保存当前音效设置\"时用。",
   "params": [],
   "mechanism": "execmd",
   "methodName": "saveCurrentEffectData",
   "pattern": "envelope",
   "form": "binder",
   "servicePackage": "com.immotors.imaudio",
   "serviceClass": "com.immotors.imaudio_service.IMAudioService",
   "bindAction": "com.immotors.imaudio_service.ACTION_BIND",
   "scope": "core",
   "deliverNote": "core 能力; 实车 verified; PRD 未提及, 超出范围"
  },
  {
   "id": "nav_start",
   "domain": "banmamap",
   "object": "navigation",
   "action": "start",
   "safetyLevel": "normal",
   "status": "verified",
   "sourceRef": "BanmaMap openapi common navigateToForAI (逆向 2026-08-17)",
   "description": "车机地图导航到指定地点。用户说'导航去XX/导航到XX'时用。name 目的地名称必填。若你能确定经纬度则给出 lat/lon; 不确定时先调用 geo_search(name) 获取坐标再传入。",
   "params": [
    {
     "name": "name",
     "type": "string",
     "optional": false,
     "description": "目的地名称, 如'同济大学'"
    },
    {
     "name": "lat",
     "type": "number",
     "optional": true,
     "description": "目的地纬度(可选)"
    },
    {
     "name": "lon",
     "type": "number",
     "optional": true,
     "description": "目的地经度(可选)"
    }
   ],
   "mechanism": "mapnav",
   "servicePackage": "com.ebanma.map.main",
   "serviceClass": "com.ebanma.map.main.service.MapExternalService",
   "bindAction": "com.ebanma.map.service.common",
   "scope": "platform",
   "deliverNote": "平台域: 地图 app 能力, 借语音通道; 不属 imaudio 交付核心"
  },
  {
   "id": "get_speed_volume_status",
   "domain": "imaudio",
   "object": "vnc",
   "action": "get",
   "safetyLevel": "readonly",
   "status": "broken",
   "sourceRef": "IMAudioServiceAdapter.kt:getSpeedVolumeStatus",
   "description": "VNC 随速音量补偿状态(当前为 stub, 不可用)。",
   "params": [],
   "mechanism": "execmd",
   "methodName": "getSpeedVolumeStatus",
   "pattern": "none",
   "form": "binder",
   "servicePackage": "com.immotors.imaudio",
   "serviceClass": "com.immotors.imaudio_service.IMAudioService",
   "bindAction": "com.immotors.imaudio_service.ACTION_BIND",
   "scope": "core",
   "deliverNote": "core 能力; 待实车复核; PRD 未提及, 超出范围"
  },
  {
   "id": "set_speed_volume_status",
   "domain": "imaudio",
   "object": "vnc",
   "action": "set",
   "safetyLevel": "normal",
   "status": "broken",
   "sourceRef": "IMAudioServiceAdapter.kt:setSpeedVolumeStatus",
   "description": "设置 VNC 随速音量补偿(当前为 stub, 不可用)。",
   "params": [
    {
     "name": "status",
     "type": "string",
     "optional": false,
     "description": "off/low/mid/high"
    }
   ],
   "mechanism": "execmd",
   "methodName": "setSpeedVolumeStatus",
   "pattern": "scalar",
   "form": "binder",
   "servicePackage": "com.immotors.imaudio",
   "serviceClass": "com.immotors.imaudio_service.IMAudioService",
   "bindAction": "com.immotors.imaudio_service.ACTION_BIND",
   "scope": "core",
   "deliverNote": "core 能力; 待实车复核; PRD 未提及, 超出范围"
  },
  {
   "id": "cc_seat_heat_driver",
   "domain": "carcontrol",
   "object": "seat_heat",
   "action": "set",
   "safetyLevel": "normal",
   "status": "verified",
   "sourceRef": "CarControlService CustomService seat_heat_driver",
   "description": "打开/关闭主驾座椅加热(on 1=开 0=关)。用户说\"打开/关闭座椅加热\"时用。",
   "params": [
    {
     "name": "on",
     "type": "int",
     "optional": false,
     "description": "1=开 0=关",
     "enum": [
      "0",
      "1"
     ]
    }
   ],
   "mechanism": "carcontrol",
   "ccDomain": "002",
   "ccFunction": "seat_heat_driver",
   "servicePackage": "com.banma.carcontrolservice",
   "serviceClass": "com.banma.carcontrolservice.service.CustomService",
   "bindAction": "com.banma.carcontrolservice.BIND_CUSTOM_SERVICE",
   "scope": "platform",
   "deliverNote": "core 能力; 实车 verified"
  },
  {
   "id": "cc_seat_heat_level_driver",
   "domain": "carcontrol",
   "object": "seat_heat_level",
   "action": "set",
   "safetyLevel": "normal",
   "status": "verified",
   "sourceRef": "CarControlService seat_heat_level_driver",
   "description": "设置主驾座椅加热档位(level 1-3)。用户说\"座椅加热调到X档\"时用。",
   "params": [
    {
     "name": "level",
     "type": "int",
     "optional": false,
     "description": "加热档位 1-3"
    }
   ],
   "mechanism": "carcontrol",
   "ccDomain": "002",
   "ccFunction": "seat_heat_level_driver",
   "servicePackage": "com.banma.carcontrolservice",
   "serviceClass": "com.banma.carcontrolservice.service.CustomService",
   "bindAction": "com.banma.carcontrolservice.BIND_CUSTOM_SERVICE",
   "scope": "platform",
   "deliverNote": "core 能力; 实车 verified"
  },
  {
   "id": "cc_seat_ventilation_driver",
   "domain": "carcontrol",
   "object": "seat_ventilation",
   "action": "set",
   "safetyLevel": "normal",
   "status": "verified",
   "sourceRef": "CarControlService seat_ventilation_driver",
   "description": "打开/关闭主驾座椅通风(on 1=开 0=关)。用户说\"打开座椅通风\"时用。",
   "params": [
    {
     "name": "on",
     "type": "int",
     "optional": false,
     "description": "1=开 0=关",
     "enum": [
      "0",
      "1"
     ]
    }
   ],
   "mechanism": "carcontrol",
   "ccDomain": "002",
   "ccFunction": "seat_ventilation_driver",
   "servicePackage": "com.banma.carcontrolservice",
   "serviceClass": "com.banma.carcontrolservice.service.CustomService",
   "bindAction": "com.banma.carcontrolservice.BIND_CUSTOM_SERVICE",
   "scope": "platform",
   "deliverNote": "core 能力; 实车 verified"
  },
  {
   "id": "cc_seat_massage_driver",
   "domain": "carcontrol",
   "object": "seat_massage",
   "action": "set",
   "safetyLevel": "normal",
   "status": "verified",
   "sourceRef": "CarControlService seat_massage_driver",
   "description": "打开/关闭主驾座椅按摩(on 1=开 0=关)。用户说\"打开座椅按摩\"时用。",
   "params": [
    {
     "name": "on",
     "type": "int",
     "optional": false,
     "description": "1=开 0=关",
     "enum": [
      "0",
      "1"
     ]
    }
   ],
   "mechanism": "carcontrol",
   "ccDomain": "002",
   "ccFunction": "seat_massage_driver",
   "servicePackage": "com.banma.carcontrolservice",
   "serviceClass": "com.banma.carcontrolservice.service.CustomService",
   "bindAction": "com.banma.carcontrolservice.BIND_CUSTOM_SERVICE",
   "scope": "platform",
   "deliverNote": "core 能力; 实车 verified"
  },
  {
   "id": "cc_seat_heat_stone_massage_driver",
   "domain": "carcontrol",
   "object": "seat_heat_stone_massage",
   "action": "set",
   "safetyLevel": "normal",
   "status": "verified",
   "sourceRef": "CarControlService seat_heat_stone_massage_driver",
   "description": "打开/关闭主驾座椅热石按摩(on 1=开 0=关)。用户说\"打开热石按摩\"时用。",
   "params": [
    {
     "name": "on",
     "type": "int",
     "optional": false,
     "description": "1=开 0=关",
     "enum": [
      "0",
      "1"
     ]
    }
   ],
   "mechanism": "carcontrol",
   "ccDomain": "002",
   "ccFunction": "seat_heat_stone_massage_driver",
   "servicePackage": "com.banma.carcontrolservice",
   "serviceClass": "com.banma.carcontrolservice.service.CustomService",
   "bindAction": "com.banma.carcontrolservice.BIND_CUSTOM_SERVICE",
   "scope": "platform",
   "deliverNote": "core 能力; 实车 verified"
  },
  {
   "id": "delete_sound_library",
   "domain": "imaudio",
   "object": "sound",
   "action": "delete",
   "safetyLevel": "normal",
   "status": "verified",
   "sourceRef": "IMAudioServiceAdapter.kt:deleteSoundLibrary",
   "description": "删除音效资源(resourceCode)。用户说\"删除这个音效\"时用。",
   "params": [
    {
     "name": "resourceCode",
     "type": "string",
     "optional": false,
     "description": "音效资源 code"
    }
   ],
   "mechanism": "execmd",
   "methodName": "deleteSoundLibrary",
   "pattern": "envelope",
   "devicePaths": [],
   "form": "binder",
   "servicePackage": "com.immotors.imaudio",
   "serviceClass": "com.immotors.imaudio_service.IMAudioService",
   "bindAction": "com.immotors.imaudio_service.ACTION_BIND",
   "scope": "core",
   "deliverNote": "core 能力; 实车 verified; PRD 未提及, 超出范围"
  },
  {
   "id": "open_air_front_page",
   "domain": "carcontrol",
   "object": "page",
   "action": "open",
   "safetyLevel": "normal",
   "status": "probe",
   "sourceRef": "CarControl 应用跳转 Intent 规范 (空调座椅intent跳转.html); registry carcontrol-registry.json",
   "description": "打开用户说\"打开空调/空调前排\"（空调前排页, Form 1 页面跳转 fire-and-forget, 可选 display 选屏 DRIVER/PASSENGER/REAR）。用户说\"打开空调/空调前排\"时用。",
   "params": [
    {
     "name": "display",
     "type": "string",
     "optional": true,
     "enum": [
      "DRIVER",
      "PASSENGER",
      "REAR"
     ],
     "description": "目标屏(默认主驾)"
    }
   ],
   "mechanism": "intent",
   "intentScreens": {
    "pkg": "com.immotors.carcontrol",
    "byDisplay": {
     "DRIVER": "com.immotors.carcontrol.MainActivity",
     "PASSENGER": "com.immotors.carcontrol.GuestScreenActivity",
     "REAR": "com.immotors.carcontrol.RearScreenActivity"
    }
   },
   "extras": [
    {
     "key": "ToCarControl",
     "fromArgs": true
    }
   ],
   "defaultArgs": {
    "type": "air",
    "subTabName": "frontSeat"
   },
   "servicePackage": "com.immotors.carcontrol",
   "serviceClass": "com.immotors.carcontrol.MainActivity",
   "scope": "platform",
   "deliverNote": "core 能力; 待实车复核"
  },
  {
   "id": "open_air_rear_page",
   "domain": "carcontrol",
   "object": "page",
   "action": "open",
   "safetyLevel": "normal",
   "status": "probe",
   "sourceRef": "CarControl 应用跳转 Intent 规范 (空调座椅intent跳转.html); registry carcontrol-registry.json",
   "description": "打开用户说\"打开空调后排\"（空调后排页, Form 1 页面跳转 fire-and-forget, 可选 display 选屏 DRIVER/PASSENGER/REAR）。用户说\"打开空调后排\"时用。",
   "params": [
    {
     "name": "display",
     "type": "string",
     "optional": true,
     "enum": [
      "DRIVER",
      "PASSENGER",
      "REAR"
     ],
     "description": "目标屏(默认主驾)"
    }
   ],
   "mechanism": "intent",
   "intentScreens": {
    "pkg": "com.immotors.carcontrol",
    "byDisplay": {
     "DRIVER": "com.immotors.carcontrol.MainActivity",
     "PASSENGER": "com.immotors.carcontrol.GuestScreenActivity",
     "REAR": "com.immotors.carcontrol.RearScreenActivity"
    }
   },
   "extras": [
    {
     "key": "ToCarControl",
     "fromArgs": true
    }
   ],
   "defaultArgs": {
    "type": "air",
    "subTabName": "rearSeat"
   },
   "servicePackage": "com.immotors.carcontrol",
   "serviceClass": "com.immotors.carcontrol.MainActivity",
   "scope": "platform",
   "deliverNote": "core 能力; 待实车复核"
  },
  {
   "id": "open_seat_heat_page",
   "domain": "carcontrol",
   "object": "page",
   "action": "open",
   "safetyLevel": "normal",
   "status": "probe",
   "sourceRef": "CarControl 应用跳转 Intent 规范 (空调座椅intent跳转.html); registry carcontrol-registry.json",
   "description": "打开用户说\"打开座椅加热/通风\"（座椅通风加热页, Form 1 页面跳转 fire-and-forget, 可选 display 选屏 DRIVER/PASSENGER/REAR）。用户说\"打开座椅加热/通风\"时用。",
   "params": [
    {
     "name": "display",
     "type": "string",
     "optional": true,
     "enum": [
      "DRIVER",
      "PASSENGER",
      "REAR"
     ],
     "description": "目标屏(默认主驾)"
    }
   ],
   "mechanism": "intent",
   "intentScreens": {
    "pkg": "com.immotors.carcontrol",
    "byDisplay": {
     "DRIVER": "com.immotors.carcontrol.MainActivity",
     "PASSENGER": "com.immotors.carcontrol.GuestScreenActivity",
     "REAR": "com.immotors.carcontrol.RearScreenActivity"
    }
   },
   "extras": [
    {
     "key": "ToCarControl",
     "fromArgs": true
    }
   ],
   "defaultArgs": {
    "type": "seat",
    "subTabName": "heatVent"
   },
   "servicePackage": "com.immotors.carcontrol",
   "serviceClass": "com.immotors.carcontrol.MainActivity",
   "scope": "platform",
   "deliverNote": "core 能力; 待实车复核"
  },
  {
   "id": "open_seat_massage_page",
   "domain": "carcontrol",
   "object": "page",
   "action": "open",
   "safetyLevel": "normal",
   "status": "probe",
   "sourceRef": "CarControl 应用跳转 Intent 规范 (空调座椅intent跳转.html); registry carcontrol-registry.json",
   "description": "打开用户说\"打开座椅按摩\"（座椅按摩页, Form 1 页面跳转 fire-and-forget, 可选 display 选屏 DRIVER/PASSENGER/REAR）。用户说\"打开座椅按摩\"时用。",
   "params": [
    {
     "name": "display",
     "type": "string",
     "optional": true,
     "enum": [
      "DRIVER",
      "PASSENGER",
      "REAR"
     ],
     "description": "目标屏(默认主驾)"
    }
   ],
   "mechanism": "intent",
   "intentScreens": {
    "pkg": "com.immotors.carcontrol",
    "byDisplay": {
     "DRIVER": "com.immotors.carcontrol.MainActivity",
     "PASSENGER": "com.immotors.carcontrol.GuestScreenActivity",
     "REAR": "com.immotors.carcontrol.RearScreenActivity"
    }
   },
   "extras": [
    {
     "key": "ToCarControl",
     "fromArgs": true
    }
   ],
   "defaultArgs": {
    "type": "seat",
    "subTabName": "massage"
   },
   "servicePackage": "com.immotors.carcontrol",
   "serviceClass": "com.immotors.carcontrol.MainActivity",
   "scope": "platform",
   "deliverNote": "core 能力; 待实车复核"
  },
  {
   "id": "open_seat_mode_page",
   "domain": "carcontrol",
   "object": "page",
   "action": "open",
   "safetyLevel": "normal",
   "status": "probe",
   "sourceRef": "CarControl 应用跳转 Intent 规范 (空调座椅intent跳转.html); registry carcontrol-registry.json",
   "description": "打开用户说\"打开座椅模式\"（座椅模式页, Form 1 页面跳转 fire-and-forget, 可选 display 选屏 DRIVER/PASSENGER/REAR）。用户说\"打开座椅模式\"时用。",
   "params": [
    {
     "name": "display",
     "type": "string",
     "optional": true,
     "enum": [
      "DRIVER",
      "PASSENGER",
      "REAR"
     ],
     "description": "目标屏(默认主驾)"
    }
   ],
   "mechanism": "intent",
   "intentScreens": {
    "pkg": "com.immotors.carcontrol",
    "byDisplay": {
     "DRIVER": "com.immotors.carcontrol.MainActivity",
     "PASSENGER": "com.immotors.carcontrol.GuestScreenActivity",
     "REAR": "com.immotors.carcontrol.RearScreenActivity"
    }
   },
   "extras": [
    {
     "key": "ToCarControl",
     "fromArgs": true
    }
   ],
   "defaultArgs": {
    "type": "seat",
    "subTabName": "mode"
   },
   "servicePackage": "com.immotors.carcontrol",
   "serviceClass": "com.immotors.carcontrol.MainActivity",
   "scope": "platform",
   "deliverNote": "core 能力; 待实车复核"
  },
  {
   "id": "open_seat_position_page",
   "domain": "carcontrol",
   "object": "page",
   "action": "open",
   "safetyLevel": "normal",
   "status": "probe",
   "sourceRef": "CarControl 应用跳转 Intent 规范 (空调座椅intent跳转.html); registry carcontrol-registry.json",
   "description": "打开用户说\"调节座椅位置\"（座椅位置调节页, Form 1 页面跳转 fire-and-forget, 可选 display 选屏 DRIVER/PASSENGER/REAR）。用户说\"调节座椅位置\"时用。",
   "params": [
    {
     "name": "display",
     "type": "string",
     "optional": true,
     "enum": [
      "DRIVER",
      "PASSENGER",
      "REAR"
     ],
     "description": "目标屏(默认主驾)"
    }
   ],
   "mechanism": "intent",
   "intentScreens": {
    "pkg": "com.immotors.carcontrol",
    "byDisplay": {
     "DRIVER": "com.immotors.carcontrol.MainActivity",
     "PASSENGER": "com.immotors.carcontrol.GuestScreenActivity",
     "REAR": "com.immotors.carcontrol.RearScreenActivity"
    }
   },
   "extras": [
    {
     "key": "ToCarControl",
     "fromArgs": true
    }
   ],
   "defaultArgs": {
    "type": "seat",
    "subTabName": "position"
   },
   "servicePackage": "com.immotors.carcontrol",
   "serviceClass": "com.immotors.carcontrol.MainActivity",
   "scope": "platform",
   "deliverNote": "core 能力; 待实车复核"
  },
  {
   "id": "open_light_page",
   "domain": "carcontrol",
   "object": "page",
   "action": "open",
   "safetyLevel": "normal",
   "status": "probe",
   "sourceRef": "CarControl 应用跳转 Intent 规范 (空调座椅intent跳转.html); registry carcontrol-registry.json",
   "description": "打开用户说\"打开灯光\"（灯光页, Form 1 页面跳转 fire-and-forget, 可选 display 选屏 DRIVER/PASSENGER/REAR）。用户说\"打开灯光\"时用。",
   "params": [
    {
     "name": "display",
     "type": "string",
     "optional": true,
     "enum": [
      "DRIVER",
      "PASSENGER",
      "REAR"
     ],
     "description": "目标屏(默认主驾)"
    }
   ],
   "mechanism": "intent",
   "intentScreens": {
    "pkg": "com.immotors.carcontrol",
    "byDisplay": {
     "DRIVER": "com.immotors.carcontrol.MainActivity",
     "PASSENGER": "com.immotors.carcontrol.GuestScreenActivity",
     "REAR": "com.immotors.carcontrol.RearScreenActivity"
    }
   },
   "extras": [
    {
     "key": "ToCarControl",
     "fromArgs": true
    }
   ],
   "defaultArgs": {
    "type": "light"
   },
   "servicePackage": "com.immotors.carcontrol",
   "serviceClass": "com.immotors.carcontrol.MainActivity",
   "scope": "platform",
   "deliverNote": "core 能力; 待实车复核"
  }
 ],
 "prdCoverage": {
  "source": "IM audio PRD文档-V2.6-20260527.md",
  "items": [
   {
    "id": "prd-3.1",
    "title": "音量调节(整车/头枕音区)",
    "capIds": [
     "set_car_and_headrest_volume",
     "get_last_volume_data"
    ],
    "status": "matched",
    "note": "设置+回读均覆盖"
   },
   {
    "id": "prd-3.2",
    "title": "音场/均衡器切换",
    "capIds": [
     "set_sound_stage"
    ],
    "status": "matched",
    "note": "含 K 歌/沉浸等全部音场档位"
   },
   {
    "id": "prd-3.4",
    "title": "音效库试听/安装/删除",
    "capIds": [
     "preview_sound",
     "install_sound_library",
     "delete_sound_library"
    ],
    "status": "matched",
    "note": ""
   },
   {
    "id": "prd-5.2",
    "title": "锁车音自定义(多车机主题)",
    "capIds": [],
    "status": "prd-only",
    "note": ""
   },
   {
    "id": "prd-6.1",
    "title": "杜比全景声内容开关",
    "capIds": [],
    "status": "prd-only",
    "note": "源码未见对应控制入口(本轮输入形态未含该模块)"
   },
   {
    "id": "prd-6.3",
    "title": "多用户音效偏好云同步",
    "capIds": [],
    "status": "prd-only",
    "note": "属云端能力, 车端包内无实现"
   }
  ]
 },
 "mediaBuiltins": [
  {
   "id": "media_next",
   "action": "next",
   "description": "Control media playback: next on the active session (切下一首)"
  },
  {
   "id": "media_prev",
   "action": "prev",
   "description": "Control media playback: prev on the active session (切上一首)"
  },
  {
   "id": "media_play",
   "action": "play",
   "description": "Control media playback: play on the active session (播放)"
  },
  {
   "id": "media_pause",
   "action": "pause",
   "description": "Control media playback: pause on the active session (暂停)"
  }
 ],
 "registry": {
  "present": true,
  "tools": 34,
  "byMechanism": {
   "execmd": 21,
   "mapnav": 1,
   "carcontrol": 5,
   "intent": 7
  },
  "entries": [
   {
    "id": "get_sound_stage",
    "mechanism": "execmd",
    "methodName": "getSoundStage",
    "pattern": "none",
    "dataClass": null,
    "form": "binder",
    "status": "verified",
    "sourceRef": "IMAudioServiceAdapter.kt:getSoundStage"
   },
   {
    "id": "set_sound_stage",
    "mechanism": "execmd",
    "methodName": "setSoundStage",
    "pattern": "dataclass",
    "dataClass": "EffectModeAndFB",
    "form": "binder",
    "status": "verified",
    "sourceRef": "IMAudioServiceAdapter.kt:setSoundStage"
   },
   {
    "id": "set_beosonic_point",
    "mechanism": "execmd",
    "methodName": "setBeosonicPoint",
    "pattern": "dataclass",
    "dataClass": "BeosonicPoint",
    "form": "binder",
    "status": "verified",
    "sourceRef": "IMAudioServiceAdapter.kt:setBeosonicPoint"
   },
   {
    "id": "get_mic_vocal",
    "mechanism": "execmd",
    "methodName": "getMicVocal",
    "pattern": "none",
    "dataClass": null,
    "form": "binder",
    "status": "verified",
    "sourceRef": "IMAudioServiceAdapter.kt:getMicVocal"
   },
   {
    "id": "set_mic_vocal",
    "mechanism": "execmd",
    "methodName": "setMicVocal",
    "pattern": "scalar",
    "dataClass": null,
    "form": "binder",
    "status": "verified",
    "sourceRef": "IMAudioServiceAdapter.kt:setMicVocal"
   },
   {
    "id": "get_fast_audio_mode",
    "mechanism": "execmd",
    "methodName": "getFastAudioMode",
    "pattern": "none",
    "dataClass": null,
    "form": "binder",
    "status": "verified",
    "sourceRef": "IMAudioServiceAdapter.kt:getFastAudioMode"
   },
   {
    "id": "set_fast_audio_mode",
    "mechanism": "execmd",
    "methodName": "setFastAudioMode",
    "pattern": "scalar",
    "dataClass": null,
    "form": "binder",
    "status": "verified",
    "sourceRef": "IMAudioServiceAdapter.kt:setFastAudioMode"
   },
   {
    "id": "set_car_and_headrest_volume",
    "mechanism": "execmd",
    "methodName": "setCarAndHeadrestVolume",
    "pattern": "scalar",
    "dataClass": null,
    "form": "binder",
    "status": "verified",
    "sourceRef": "IMAudioServiceAdapter.kt:setCarAndHeadrestVolume"
   },
   {
    "id": "get_last_volume_data",
    "mechanism": "execmd",
    "methodName": "getLastVolumeData",
    "pattern": "scalar",
    "dataClass": null,
    "form": "binder",
    "status": "verified",
    "sourceRef": "IMAudioServiceAdapter.kt:getLastVolumeData"
   },
   {
    "id": "query_current_active_sound",
    "mechanism": "execmd",
    "methodName": "queryCurrentActiveSound",
    "pattern": "none",
    "dataClass": null,
    "form": "binder",
    "status": "verified",
    "sourceRef": "IMAudioServiceAdapter.kt:queryCurrentActiveSound"
   },
   {
    "id": "query_sound_library",
    "mechanism": "execmd",
    "methodName": "querySoundLibrary",
    "pattern": "envelope",
    "dataClass": null,
    "form": "binder",
    "status": "verified",
    "sourceRef": "IMAudioServiceAdapter.kt:querySoundLibrary"
   },
   {
    "id": "install_sound_library",
    "mechanism": "execmd",
    "methodName": "installSoundLibrary",
    "pattern": "envelope",
    "dataClass": null,
    "form": "binder",
    "status": "verified",
    "sourceRef": "IMAudioServiceAdapter.kt:installSoundLibrary"
   },
   {
    "id": "preview_sound",
    "mechanism": "execmd",
    "methodName": "previewSound",
    "pattern": "envelope",
    "dataClass": null,
    "form": "binder",
    "status": "verified",
    "sourceRef": "IMAudioServiceAdapter.kt:previewSound"
   },
   {
    "id": "query_effect_library",
    "mechanism": "execmd",
    "methodName": "queryEffectLibrary",
    "pattern": "dataclass",
    "dataClass": "EffectRequest",
    "form": "binder",
    "status": "verified",
    "sourceRef": "IMAudioServiceAdapter.kt:queryEffectLibrary"
   },
   {
    "id": "add_effect",
    "mechanism": "execmd",
    "methodName": "addEffect",
    "pattern": "envelope",
    "dataClass": null,
    "form": "binder",
    "status": "verified",
    "sourceRef": "IMAudioServiceAdapter.kt:addEffect"
   },
   {
    "id": "update_effect",
    "mechanism": "execmd",
    "methodName": "updateEffect",
    "pattern": "envelope",
    "dataClass": null,
    "form": "binder",
    "status": "verified",
    "sourceRef": "IMAudioServiceAdapter.kt:updateEffect"
   },
   {
    "id": "delete_effect",
    "mechanism": "execmd",
    "methodName": "deleteEffect",
    "pattern": "envelope",
    "dataClass": null,
    "form": "binder",
    "status": "verified",
    "sourceRef": "IMAudioServiceAdapter.kt:deleteEffect"
   },
   {
    "id": "get_effect_share_code",
    "mechanism": "execmd",
    "methodName": "getEffectShareCode",
    "pattern": "envelope",
    "dataClass": null,
    "form": "binder",
    "status": "verified",
    "sourceRef": "IMAudioServiceAdapter.kt:getEffectShareCode"
   },
   {
    "id": "add_effect_by_share_code",
    "mechanism": "execmd",
    "methodName": "addEffectByShareCode",
    "pattern": "envelope",
    "dataClass": null,
    "form": "binder",
    "status": "verified",
    "sourceRef": "IMAudioServiceAdapter.kt:addEffectByShareCode"
   },
   {
    "id": "save_current_effect_data",
    "mechanism": "execmd",
    "methodName": "saveCurrentEffectData",
    "pattern": "envelope",
    "dataClass": null,
    "form": "binder",
    "status": "verified",
    "sourceRef": "IMAudioServiceAdapter.kt:saveCurrentEffectData"
   },
   {
    "id": "nav_start",
    "mechanism": "mapnav",
    "methodName": "",
    "pattern": "",
    "dataClass": null,
    "form": "",
    "status": "verified",
    "sourceRef": "BanmaMap openapi common navigateToForAI (逆向 2026-08-17)"
   },
   {
    "id": "cc_seat_heat_driver",
    "mechanism": "carcontrol",
    "methodName": "",
    "pattern": "",
    "dataClass": null,
    "form": "",
    "status": "verified",
    "sourceRef": "CarControlService CustomService seat_heat_driver"
   },
   {
    "id": "cc_seat_heat_level_driver",
    "mechanism": "carcontrol",
    "methodName": "",
    "pattern": "",
    "dataClass": null,
    "form": "",
    "status": "verified",
    "sourceRef": "CarControlService seat_heat_level_driver"
   },
   {
    "id": "cc_seat_ventilation_driver",
    "mechanism": "carcontrol",
    "methodName": "",
    "pattern": "",
    "dataClass": null,
    "form": "",
    "status": "verified",
    "sourceRef": "CarControlService seat_ventilation_driver"
   },
   {
    "id": "cc_seat_massage_driver",
    "mechanism": "carcontrol",
    "methodName": "",
    "pattern": "",
    "dataClass": null,
    "form": "",
    "status": "verified",
    "sourceRef": "CarControlService seat_massage_driver"
   },
   {
    "id": "cc_seat_heat_stone_massage_driver",
    "mechanism": "carcontrol",
    "methodName": "",
    "pattern": "",
    "dataClass": null,
    "form": "",
    "status": "verified",
    "sourceRef": "CarControlService seat_heat_stone_massage_driver"
   },
   {
    "id": "delete_sound_library",
    "mechanism": "execmd",
    "methodName": "deleteSoundLibrary",
    "pattern": "envelope",
    "dataClass": null,
    "form": "binder",
    "status": "verified",
    "sourceRef": "IMAudioServiceAdapter.kt:deleteSoundLibrary"
   },
   {
    "id": "open_air_front_page",
    "mechanism": "intent",
    "methodName": "",
    "pattern": "",
    "dataClass": null,
    "form": "",
    "status": "probe",
    "sourceRef": "CarControl 应用跳转 Intent 规范 (空调座椅intent跳转.html); registry carcontrol-registry.json"
   },
   {
    "id": "open_air_rear_page",
    "mechanism": "intent",
    "methodName": "",
    "pattern": "",
    "dataClass": null,
    "form": "",
    "status": "probe",
    "sourceRef": "CarControl 应用跳转 Intent 规范 (空调座椅intent跳转.html); registry carcontrol-registry.json"
   },
   {
    "id": "open_seat_heat_page",
    "mechanism": "intent",
    "methodName": "",
    "pattern": "",
    "dataClass": null,
    "form": "",
    "status": "probe",
    "sourceRef": "CarControl 应用跳转 Intent 规范 (空调座椅intent跳转.html); registry carcontrol-registry.json"
   },
   {
    "id": "open_seat_massage_page",
    "mechanism": "intent",
    "methodName": "",
    "pattern": "",
    "dataClass": null,
    "form": "",
    "status": "probe",
    "sourceRef": "CarControl 应用跳转 Intent 规范 (空调座椅intent跳转.html); registry carcontrol-registry.json"
   },
   {
    "id": "open_seat_mode_page",
    "mechanism": "intent",
    "methodName": "",
    "pattern": "",
    "dataClass": null,
    "form": "",
    "status": "probe",
    "sourceRef": "CarControl 应用跳转 Intent 规范 (空调座椅intent跳转.html); registry carcontrol-registry.json"
   },
   {
    "id": "open_seat_position_page",
    "mechanism": "intent",
    "methodName": "",
    "pattern": "",
    "dataClass": null,
    "form": "",
    "status": "probe",
    "sourceRef": "CarControl 应用跳转 Intent 规范 (空调座椅intent跳转.html); registry carcontrol-registry.json"
   },
   {
    "id": "open_light_page",
    "mechanism": "intent",
    "methodName": "",
    "pattern": "",
    "dataClass": null,
    "form": "",
    "status": "probe",
    "sourceRef": "CarControl 应用跳转 Intent 规范 (空调座椅intent跳转.html); registry carcontrol-registry.json"
   }
  ],
  "missingFromRegistry": [],
  "extraInRegistry": []
 },
 "functionSchemaDeliverable": null,
 "probe": {
  "present": false
 }
};
