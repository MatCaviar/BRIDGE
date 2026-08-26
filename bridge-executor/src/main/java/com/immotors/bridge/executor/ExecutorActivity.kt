package com.immotors.bridge.executor

import android.app.Activity
import android.app.ActivityOptions
import android.content.ComponentName
import android.content.Intent
import android.content.ServiceConnection
import android.hardware.display.DisplayManager
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import com.banma.custom.CustomMessage
import com.banma.custom.CustomResponse
import com.banma.custom.ICustomResponseCallback
import com.banma.custom.ICustomService
import com.ebanma.map.openapi.basicclass.IChangeDestinationCallback
import com.ebanma.map.openapi.basicclass.IKeywordSearchCallback
import com.ebanma.map.openapi.basicclass.IMapCommonService
import com.ebanma.map.openapi.basicclass.INavigateCallback
import com.ebanma.map.openapi.basicclass.Poi
import com.ebanma.map.openapi.basicclass.RequestRouteInfoForAI
import com.immotors.aidl.IIMAudioCallback
import com.immotors.aidl.IIMAudioService
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Standalone BRIDGE executor. Lives in its OWN app and binds the TARGET app's EXISTING AIDL service
 * CROSS-APP — the target app is NOT modified. All per-app knowledge (the AIDL contract + the registry
 * that maps op→method+pattern+devicePaths) lives on the BRIDGE side; the executor reflects on the
 * target's AIDL by method name. Adding a target app = ship its AIDL contract + a registry with BRIDGE,
 * never touch the app.
 *
 * Dispatch by pattern (from the registry):
 *   none      → no-arg getter
 *   scalar    → (paramJson = args)
 *   dataclass → (paramJson = args)
 *   envelope  → (paramJson = {body:args, headers, options} + device values e.g. vin injected at devicePaths)
 *
 * Flow: host writes filesDir/imrpc/cmd.json → `am start` → bind target service → reflect+invoke →
 * write result.json → finish.
 */
class ExecutorActivity : Activity() {
    companion object {
        private const val TAG = "BridgeExecutor"
        private const val REGISTRY_FILE = "registry.json"
        private var registry: JSONObject? = null
        private var reqIdCounter = 0
    }

    private data class Cmd(val reqId: String, val op: String, val args: JSONObject)
    private data class Tool(val methodName: String, val pattern: String, val devicePaths: JSONArray, val mechanism: String = "aidl", val raw: JSONObject? = null)

    private lateinit var cmdFile: File
    private lateinit var resultFile: File
    private var finished = false
    private var conn: ServiceConnection? = null
    private val handler = Handler(Looper.getMainLooper())
    private val timeoutMs = 5000L
    private var curReqId = ""
    private val timeout = Runnable { done(curReqId, false, "TIMEOUT", null) }

    override fun onCreate(savedInstanceState: Bundle?) {
        Log.i(TAG, "onCreate: entered")
        super.onCreate(savedInstanceState)
        val dir = File(filesDir, "imrpc").apply { mkdirs() }
        cmdFile = File(dir, "cmd.json")
        resultFile = File(dir, "result.json")
        val cmd = try { readCmd() } catch (e: Exception) { null }
        if (cmd == null) { done("", false, "cmd unreadable", null); return }
        curReqId = cmd.reqId
        val tool = lookupTool(cmd.op)
        if (tool == null) { done(cmd.reqId, false, "UNKNOWN_OP ${cmd.op}", null); return }

        // media / intent 不依赖目标 AIDL service 在场 — 直接执行, 免 bind
        if (tool.mechanism == "media") {
            doneWithResponse(cmd.reqId, dispatchMedia(tool)); return
        }
        if (tool.mechanism == "intent") {
            doneWithResponse(cmd.reqId, dispatchIntent(tool, cmd.args)); return
        }

        val reg = loadRegistry()
        // registry 下沉: tool 级 servicePackage/serviceClass/bindAction 优先, 缺省回退顶层(单 app 旧 schema)
        val rawTool = tool.raw
        val svcPkg = rawTool?.optString("servicePackage", "").orEmpty()
            .ifEmpty { reg?.optString("servicePackage", "").orEmpty() }
        val svcCls = rawTool?.optString("serviceClass", "").orEmpty()
            .ifEmpty { reg?.optString("serviceClass", "").orEmpty() }
        if (svcPkg.isEmpty() || svcCls.isEmpty()) {
            done(cmd.reqId, false, "NO_SERVICE_TARGET", null); return
        }
        val bindAction = rawTool?.optString("bindAction", "") ?: ""
        val svc = ComponentName(svcPkg, svcCls)
        Log.i(TAG, "target=$svc action=$bindAction op=${cmd.op} method=${tool.methodName} pattern=${tool.pattern}")

        // mapnav 需要算路回调, 超时放宽
        handler.postDelayed(timeout, if (tool.mechanism == "mapnav" || tool.mechanism == "carcontrol") 15000L else timeoutMs)
        val c = object : ServiceConnection {
            override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
                Log.i(TAG, "onServiceConnected (CROSS-APP reflect): ${tool.methodName}")
                try {
                    when (tool.mechanism) {
                        "mapnav" -> {
                            val msvc = IMapCommonService.Stub.asInterface(binder)
                            doneWithResponse(cmd.reqId, dispatchMapCommon(msvc, tool, cmd.args))
                        }
                        "carcontrol" -> {
                            val csvc = ICustomService.Stub.asInterface(binder)
                            doneWithResponse(cmd.reqId, dispatchCarControl(csvc, tool, cmd.args))
                        }
                        "aidl" -> {
                            // 通用反射: 接口类由 registry 的 interfaceClass 声明(任意 AIDL 多方法接口, 需编译进本 APK)
                            val iface = rawTool?.optString("interfaceClass", "") ?: ""
                            if (iface.isEmpty()) {
                                done(cmd.reqId, false, "NO_INTERFACE_CLASS", null)
                            } else {
                                val proxy = reflectAsInterface(iface, binder ?: throw IllegalStateException("null binder"))
                                doneWithResponse(cmd.reqId, dispatchReflect(proxy, tool, cmd.args))
                            }
                        }
                        else -> {
                            val service = IIMAudioService.Stub.asInterface(binder)
                            val response = dispatch(service, tool, cmd.args)
                            doneWithResponse(cmd.reqId, response)
                        }
                    }
                } catch (e: Exception) {
                    done(cmd.reqId, false, "RPC_ERROR: ${e.message}", null)
                }
            }
            override fun onServiceDisconnected(name: ComponentName?) {}
        }
        conn = c
        val bindIntent = Intent().apply { component = svc }
        if (bindAction.isNotEmpty()) {
            bindIntent.action = bindAction
            // 地图 MapExternalService.onBind 读 "packageName" extra 做白名单校验 (空则直接拦截);
            // 白名单本身为空 → 非空 packageName 即放行。仅带 action 的服务需要。
            bindIntent.putExtra("packageName", packageName)
        }
        val bound = try {
            bindService(bindIntent, c, BIND_AUTO_CREATE)
        } catch (e: SecurityException) {
            done(cmd.reqId, false, "BIND_SECURITY: ${e.message}", null); return
        }
        if (!bound) { Log.w(TAG, "bindService returned false"); done(cmd.reqId, false, "BIND_FAILED", null) }
    }

    override fun onDestroy() {
        handler.removeCallbacks(timeout)
        conn?.let { try { unbindService(it) } catch (_: Exception) {} }
        super.onDestroy()
    }

    private fun done(reqId: String, ok: Boolean, error: String?, data: JSONObject?) {
        if (finished) return
        finished = true
        Log.i(TAG, "done: ok=$ok error=$error hasData=${data != null}")
        handler.removeCallbacks(timeout)
        writeResult(reqId, ok, error, data)
        if (!isFinishing) finish()
    }

    /** Convert the executor response envelope into the host-visible success bit. */
    private fun doneWithResponse(reqId: String, response: JSONObject) {
        val rawCode = response.opt("code")
        val code = when (rawCode) {
            is Number -> rawCode.toInt()
            is String -> rawCode.toIntOrNull()
            else -> null
        }
        val codeOk = code == null || code == 0 || code == 200 || code == 1000
        val explicitFailure =
            (response.has("ok") && !response.optBoolean("ok")) ||
            (response.has("success") && !response.optBoolean("success"))
        val ok = codeOk && !explicitFailure
        val error = if (ok) null else response.optString("message", "").ifEmpty {
            if (code != null) "EXECUTOR_ERROR code=$code" else "EXECUTOR_ERROR"
        }
        done(reqId, ok, error, response)
    }

    /** Dispatch a bound execmd or legacy AIDL target by registry method and parameter pattern. */
    private fun dispatch(svc: IIMAudioService, tool: Tool, args: JSONObject): JSONObject {
        if (tool.mechanism == "execmd") return dispatchExecCmd(svc, tool, args)
        val paramJson: String? = when (tool.pattern) {
            "none" -> null
            "envelope" -> buildEnvelope(tool, args).toString()
            else -> args.toString()
        }
        val m = if (paramJson == null) IIMAudioService::class.java.getMethod(tool.methodName)
                else IIMAudioService::class.java.getMethod(tool.methodName, String::class.java)
        val raw = m.invoke(svc) as? String
        val desc = try { svc.asBinder().interfaceDescriptor } catch (e: Exception) { "err:${e.message}" }
        Log.i(TAG, "reflect desc=$desc ${tool.methodName}(${tool.pattern}) param=${paramJson ?: "<none>"} -> ${if (raw == null) "NULL" else "[" + raw.length + "]" + raw.take(180)}")
        if (raw.isNullOrEmpty()) return JSONObject().apply {
            put("code", 501); put("message", "NULL_RETURN ${tool.methodName} (desc=$desc, ${tool.pattern})"); put("data", JSONObject.NULL)
        }
        return JSONObject(raw)
    }

    /** media mechanism: control the active MediaSession via the standard MediaController (app-agnostic —
     *  no target AIDL needed; works for any media app that exposes a session). methodName = transport action. */
    private fun dispatchMedia(tool: Tool): JSONObject {
        val action = tool.methodName
        val mgr = getSystemService(MediaSessionManager::class.java)
        // Prefer a session that reports a playback state (most likely the active player); else any session.
        val sessions = mgr?.getActiveSessions(null).orEmpty()
        val target = sessions.firstOrNull { it.playbackState != null } ?: sessions.firstOrNull()
        if (target == null) {
            return JSONObject().apply { put("code", 500); put("message", "NO_ACTIVE_MEDIA_SESSION"); put("methodName", action); put("data", JSONObject.NULL) }
        }
        val tc = target.transportControls
        when (action) {
            "next" -> tc.skipToNext()
            "prev" -> tc.skipToPrevious()
            "play" -> tc.play()
            "pause" -> tc.pause()
            else -> return JSONObject().apply { put("code", 500); put("message", "UNKNOWN_MEDIA_ACTION $action"); put("methodName", action); put("data", JSONObject.NULL) }
        }
        return JSONObject().apply {
            put("code", 1000); put("message", "SUCCESS")
            put("methodName", action)
            put("data", JSONObject().put("session", target.packageName).put("action", action))
        }
    }

    /** intent 机制 (Form 1 startActivity, fire-and-forget 页面跳转, 如 CarControl 空调/座椅/灯光)。
     *  registry tool: component{pkg,cls}(可选) 或 intentScreens{pkg,byDisplay{DRIVER/PASSENGER/REAR->cls}};
     *  兼容旧 registry 顶层 intentScreens，但新产物以工具级配置为准。
     *  extras[{key, fromArgs?|value?}]; args(默认值); displayArg/displayDefault 选屏。
     *  CarControl 契约: 单个 extra "ToCarControl" = JSON{type,subTabName}。*/
    private fun dispatchIntent(tool: Tool, args: JSONObject): JSONObject {
        val raw = tool.raw
        val intent = Intent()
        val reg = loadRegistry()
        val screens = raw?.optJSONObject("intentScreens") ?: reg?.optJSONObject("intentScreens")
        val displayArg = raw?.optString("displayArg", "display") ?: "display"
        val display = (args.optString(displayArg).ifEmpty { raw?.optString("displayDefault", "") ?: "" }).uppercase()

        val comp = raw?.optJSONObject("component")
        val pkg: String; val cls: String
        if (comp != null) { pkg = comp.getString("pkg"); cls = comp.getString("cls") }
        else if (screens != null) {
            pkg = screens.getString("pkg")
            val byDisplay = screens.getJSONObject("byDisplay")
            cls = byDisplay.optString(display, byDisplay.optString("DRIVER", "")).ifEmpty { return intentErr("NO_COMPONENT(cls for display=$display)") }
        } else return intentErr("NO_COMPONENT")

        intent.setClassName(pkg, cls)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        // Deep-link 页面路由 (如 imaudio://soundeffects/official): registry tool 可声明固定 dataUri,
        // 调用 args 全部以 query 参数拼到 URI 上 (例如 mode=custom&customEq=true)。
        val dataUri = raw?.optString("dataUri", "") ?: ""
        if (dataUri.isNotEmpty()) {
            val uri = android.net.Uri.parse(dataUri).buildUpon()
            for (k in args.keys()) if (k != displayArg) {
                val v = args.opt(k)
                uri.appendQueryParameter(k, if (v != null) v.toString() else "")
            }
            intent.data = uri.build()
            intent.action = Intent.ACTION_VIEW
        }

        val extras = raw?.optJSONArray("extras")
        if (extras != null && extras.length() > 0) {
            val merged = JSONObject()
            raw?.optJSONObject("args")?.let { d -> for (k in d.keys()) merged.put(k, d.get(k)) }
            for (k in args.keys()) if (k != displayArg) merged.put(k, args.get(k))
            for (i in 0 until extras.length()) {
                val e = extras.getJSONObject(i)
                val key = e.getString("key")
                val value = if (e.optBoolean("fromArgs", false)) merged.toString() else e.optString("value", "")
                intent.putExtra(key, value)
            }
        }

        return try {
            val dispId = resolveDisplayId(display)
            if (dispId >= 0) {
                val opts = ActivityOptions.makeBasic()
                opts.setLaunchDisplayId(dispId)
                startActivity(intent, opts.toBundle())
            } else {
                startActivity(intent)
            }
            Log.i(TAG, "intent launched: $pkg/$cls display=$display dispId=$dispId")
            JSONObject().apply {
                put("code", 1000); put("message", "SUCCESS"); put("methodName", "intent")
                put("data", JSONObject().put("pkg", pkg).put("cls", cls).put("display", display).put("launched", true))
            }
        } catch (e: Exception) {
            intentErr("INTENT_FAIL: ${e.message}")
        }
    }

    /** 把屏名(DRIVER/PASSENGER/REAR)映射到 displayId(DisplayManager 按名匹配; 车机实际屏名需车端核对)。*/
    private fun resolveDisplayId(name: String): Int {
        if (name.isEmpty()) return -1
        val dm = getSystemService(DisplayManager::class.java) ?: return -1
        for (d in dm.displays) {
            try { if (d.name.uppercase().contains(name)) return d.displayId } catch (_: Exception) {}
        }
        return -1
    }

    private fun intentErr(msg: String): JSONObject = JSONObject().apply {
        put("code", 500); put("message", msg); put("methodName", "intent"); put("data", JSONObject.NULL)
    }

    /** execmd 机制 (车机 v1 D-Bus 桥): executeCommand({command,jsonRequest}, cb) → 结果经 cb.onCallback(json) 回。
     *  command = tool.methodName; jsonRequest = args JSON(none→{})。异步等 onCallback, 超时 5s。*/
    private fun dispatchExecCmd(svc: IIMAudioService, tool: Tool, args: JSONObject): JSONObject {
        val cmdName = tool.methodName
        val jsonReq: String = when (tool.pattern) {
            "none" -> "{}"
            "envelope" -> buildEnvelope(tool, args).toString()
            else -> args.toString()
        }
        // Car v1 Command envelope: {command, params} — params is the key the factory dispatcher
        // reads (Gson → Command(callerId, command, params)); "jsonRequest" leaves params null → "fromJson(...) must not be null".
        val commandStr = JSONObject().apply { put("command", cmdName); put("params", jsonReq) }.toString()
        val latch = CountDownLatch(1)
        val resultBox = arrayOfNulls<String>(1)
        val cb = object : IIMAudioCallback.Stub() {
            override fun onCallback(json: String?) { resultBox[0] = json; latch.countDown() }
        }
        return try {
            svc.executeCommand(commandStr, cb)
            val got = latch.await(5, TimeUnit.SECONDS)
            val raw = resultBox[0]
            Log.i(TAG, "execmd $cmdName jsonReq=$jsonReq await=$got -> ${if (raw.isNullOrEmpty()) "NULL" else "[" + raw.length + "]" + raw.take(180)}")
            if (raw.isNullOrEmpty()) JSONObject().apply { put("code", 502); put("message", "NO_CALLBACK $cmdName"); put("data", JSONObject.NULL) }
            else JSONObject(raw)
        } catch (e: Exception) {
            Log.e(TAG, "execmd $cmdName failed", e)
            JSONObject().apply { put("code", 500); put("message", "EXECMD_FAIL $cmdName: ${e.message}"); put("data", JSONObject.NULL) }
        }
    }

    /** mapnav 机制 (BanmaMap openapi COMMON 接口, AI 一步导航):
     *  navigateToForAI(RequestRouteInfoForAI{destPos}) — 无调用方白名单限制 (confirmPreviewNavigation 有, 仅地图自身/openapidemo)。
     *  destPos 必须带经纬度: 缺 lat/lon 时先用 getSearchDataByKeyWords 搜 POI 补坐标 (与语音助手同款流程)。
     *  startPos 传 null → 地图端回退车辆当前位置。契约逆向自车上 BanmaMap dex (2026-08-17)。
     *  args: {name, lat?, lon?}。callerId = 本包名。*/
    /** 常用地点坐标兜底 (车无外网时高德云搜索不可用; 仅演示/常用地). */
    private val BUILTIN_POI: Map<String, DoubleArray> = mapOf(
        "同济大学" to doubleArrayOf(31.2876, 121.5006),
        "上海虹桥站" to doubleArrayOf(31.1942, 121.3188),
        "上海火车站" to doubleArrayOf(31.2514, 121.4560),
        "上海南站" to doubleArrayOf(31.1546, 121.4310),
        "人民广场" to doubleArrayOf(31.2304, 121.4737),
        "外滩" to doubleArrayOf(31.2400, 121.4906),
        "陆家嘴" to doubleArrayOf(31.2397, 121.4998),
    )

    private fun dispatchMapCommon(svc: IMapCommonService, tool: Tool, args: JSONObject): JSONObject {
        val callerId = packageName
        return try {
            val ready = svc.getMapServiceReadyState(callerId)
            if (!ready) {
                return JSONObject().apply { put("code", 500); put("message", "MAP_NOT_READY"); put("data", JSONObject.NULL) }
            }
            val name = args.optString("name", "")
            var poi = Poi()
            poi.name = name
            if (args.has("lat")) poi.lat = args.optDouble("lat", 0.0)
            if (args.has("lon")) poi.lon = args.optDouble("lon", 0.0)
            if (args.has("lat") && args.has("lon") && poi.lat != 0.0 && poi.lon != 0.0) {
                // 坐标齐了, 直接用
            } else if (BUILTIN_POI.containsKey(name)) {
                // 常用地点兜底 (车无外网, 高德云搜索不可用)
                val b = BUILTIN_POI.getValue(name)
                poi.lat = b[0]; poi.lon = b[1]
            } else {
                // 缺坐标 → 关键词搜索补 POI
                val sLatch = CountDownLatch(1)
                val sFail = arrayOfNulls<String>(1)
                val sPois = arrayOfNulls<List<Poi>>(1)
                val sCb = object : IKeywordSearchCallback.Stub() {
                    override fun onFailure(code: Int, message: String?) { sFail[0] = "code=$code msg=${message ?: ""}"; sLatch.countDown() }
                    override fun onSuccess(pois: List<Poi>?) { sPois[0] = pois; sLatch.countDown() }
                }
                svc.getSearchDataByKeyWords(callerId, name, sCb)
                val sGot = sLatch.await(10, TimeUnit.SECONDS)
                if (!sGot) return JSONObject().apply { put("code", 500); put("message", "SEARCH_TIMEOUT"); put("data", JSONObject.NULL) }
                if (sFail[0] != null) return JSONObject().apply { put("code", 500); put("message", "SEARCH_FAIL ${sFail[0]}"); put("data", JSONObject.NULL) }
                val first = sPois[0]?.firstOrNull()
                if (first == null || first.lat == 0.0 || first.lon == 0.0) {
                    return JSONObject().apply { put("code", 500); put("message", "SEARCH_NO_RESULT"); put("data", JSONObject.NULL) }
                }
                poi = first
            }
            val info = RequestRouteInfoForAI()
            info.destPos = poi
            info.destName = poi.name ?: name
            info.routeStrategy = 0
            val latch = CountDownLatch(1)
            val failBox = arrayOfNulls<String>(1)
            val okBox = booleanArrayOf(false)
            val cb = object : INavigateCallback.Stub() {
                override fun callback(success: Boolean) { okBox[0] = success; latch.countDown() }
                override fun errorCallback(code: Int, message: String?) { failBox[0] = "code=$code msg=${message ?: ""}"; latch.countDown() }
            }
            svc.navigateToForAI(callerId, info, true, false, cb)
            val got = latch.await(12, TimeUnit.SECONDS)
            if (!got) return JSONObject().apply { put("code", 500); put("message", "NAV_TIMEOUT"); put("data", JSONObject.NULL) }
            if (failBox[0] != null) return JSONObject().apply { put("code", 500); put("message", "NAV_FAIL ${failBox[0]}"); put("data", JSONObject.NULL) }
            Log.i(TAG, "mapnav $name dest=(${poi.lat},${poi.lon}) ready=$ready callbackOk=${okBox[0]}")
            JSONObject().apply {
                put("code", if (okBox[0]) 1000 else 500)
                put("message", if (okBox[0]) "SUCCESS" else "NAV_CALLBACK_FALSE")
                put("data", JSONObject().put("destination", name).put("mapReady", ready).put("callbackOk", okBox[0]))
            }
        } catch (e: Exception) {
            Log.e(TAG, "mapnav failed", e)
            JSONObject().apply { put("code", 500); put("message", "MAPNAV_FAIL: ${e.message}"); put("data", JSONObject.NULL) }
        }
    }

    /** carcontrol 机制 (CarControlService CustomService, JSON functionId 契约 — 与 ByodService 同款):
     *  bind CustomService (BIND_CUSTOM_SERVICE) → isServiceReady → sendMessage(CustomMessage{content: JSON})
     *  → await onResponse。content: {"data":{"actionType":5,"business":9999,"businessType":"CUSTOM",
     *  "domain":"002","functionId":"...","data":{...}},"mac":"mac","taskID":"..."}。
     *  registry tool: ccDomain(默认002), ccFunction(必填); args 整体作为 data 值。*/
    private fun dispatchCarControl(svc: ICustomService, tool: Tool, args: JSONObject): JSONObject {
        val raw = tool.raw
        val domain = raw?.optString("ccDomain", "002") ?: "002"
        val function = raw?.optString("ccFunction", "") ?: ""
        if (function.isEmpty()) {
            return JSONObject().apply { put("code", 500); put("message", "NO_CC_FUNCTION"); put("data", JSONObject.NULL) }
        }
        val latch = CountDownLatch(1)
        val respBox = arrayOfNulls<CustomResponse>(1)
        val cb = object : ICustomResponseCallback.Stub() {
            override fun onResponse(response: CustomResponse?) { respBox[0] = response; latch.countDown() }
        }
        return try {
            val ready = svc.isServiceReady()
            val data = JSONObject()
            data.put("actionType", 5)
            data.put("business", 9999)
            data.put("businessType", "CUSTOM")
            data.put("domain", domain)
            data.put("functionId", function)
            data.put("data", args)
            val content = JSONObject()
            content.put("data", data)
            content.put("mac", "mac")
            content.put("taskID", "bridge^${++reqIdCounter}^${System.currentTimeMillis()}")
            val msg = CustomMessage()
            msg.id = "bridge-${System.currentTimeMillis()}"
            msg.content = content.toString()
            msg.senderId = packageName
            msg.timestamp = System.currentTimeMillis()
            svc.sendMessage(msg, cb)
            val got = latch.await(10, TimeUnit.SECONDS)
            if (!got) return JSONObject().apply { put("code", 500); put("message", "CC_TIMEOUT"); put("data", JSONObject.NULL) }
            val resp = respBox[0]
            if (resp == null) return JSONObject().apply { put("code", 500); put("message", "CC_NO_RESPONSE"); put("data", JSONObject.NULL) }
            Log.i(TAG, "carcontrol $function ready=$ready resp=${resp.content}")
            val parsed = try { JSONObject(resp.content) } catch (e: Exception) { null }
            if (parsed != null) {
                val detail = parsed.optString("detail", "")
                val d = parsed.optJSONObject("data")
                val code = d?.optInt("code", -1) ?: -1
                if (detail.contains("not found") || code == 1) {
                    return JSONObject().apply { put("code", 500); put("message", "CC_NOT_SUPPORTED ${detail.ifEmpty { "code=$code" }}"); put("data", JSONObject.NULL) }
                }
                return JSONObject().apply {
                    put("code", 1000); put("message", "SUCCESS")
                    put("data", JSONObject().put("functionId", function).put("response", resp.content))
                }
            }
            JSONObject().apply { put("code", 1000); put("message", "SUCCESS"); put("data", JSONObject().put("raw", resp.content)) }
        } catch (e: Exception) {
            Log.e(TAG, "carcontrol $function failed", e)
            JSONObject().apply { put("code", 500); put("message", "CC_FAIL: ${e.message}"); put("data", JSONObject.NULL) }
        }
    }

    /** 通用 AIDL 反射: 按 registry interfaceClass 反射 Stub.asInterface(binder) 得到代理。
     *  支持任意 AIDL 多方法接口(契约 .aidl 编译进本 APK 即可, 无需改本类)。 */
    private fun reflectAsInterface(iface: String, binder: IBinder): Any {
        val stubCls = Class.forName(iface + "\$Stub")
        val m = stubCls.getMethod("asInterface", IBinder::class.java)
        return m.invoke(null, binder) ?: throw IllegalStateException("asInterface returned null")
    }

    /** 通用反射分派: 按 methodName 反射调代理方法(String 参数或无参), 返回 JSON 字符串。
     *  pattern 语义与 dispatch() 一致: none=无参, envelope={body,headers,options}+设备值注入,
     *  其余(scalar/dataclass)=args 原样作为 paramJson。 */
    private fun dispatchReflect(proxy: Any, tool: Tool, args: JSONObject): JSONObject {
        val paramJson: String? = when (tool.pattern) {
            "none" -> null
            "envelope" -> buildEnvelope(tool, args).toString()
            else -> args.toString()
        }
        val m = if (paramJson == null) proxy.javaClass.getMethod(tool.methodName)
                else proxy.javaClass.getMethod(tool.methodName, String::class.java)
        val raw = m.invoke(proxy) as? String
        Log.i(TAG, "aidl-reflect ${tool.methodName}(${tool.pattern}) -> ${if (raw.isNullOrEmpty()) "NULL" else raw.take(180)}")
        if (raw.isNullOrEmpty()) return JSONObject().apply {
            put("code", 501); put("message", "NULL_RETURN ${tool.methodName}"); put("data", JSONObject.NULL)
        }
        return try { JSONObject(raw) } catch (e: Exception) {
            JSONObject().apply { put("code", 1000); put("message", "SUCCESS"); put("data", raw) }
        }
    }

    /** envelope: wrap args in {body,headers,options} + inject device values (e.g. vin) at devicePaths. */
    private fun buildEnvelope(tool: Tool, args: JSONObject): JSONObject {
        val env = JSONObject()
        env.put("body", args)
        env.put("headers", JSONObject().put("token", ""))
        env.put("options", JSONObject())
        for (i in 0 until tool.devicePaths.length()) {
            val path = tool.devicePaths.getString(i)
            val leaf = path.substringAfterLast(".")
            val value = resolveDevice(leaf)
                ?: throw IllegalStateException("DEVICE_SOURCE_UNAVAILABLE $leaf")
            setPath(env, path, value)
        }
        return env
    }

    private fun resolveDevice(name: String): String? = when (name) {
        "vin" -> getVin()?.takeIf { it.isNotEmpty() }
        else -> null
    }

    private fun getVin(): String? = try {
        val sp = Class.forName("android.os.SystemProperties")
        val get = sp.getMethod("get", String::class.java, String::class.java)
        val v = get.invoke(null, "persist.sys.vin", "") as String
        v.takeIf { it.isNotEmpty() }
    } catch (_: Exception) { null }

    private fun setPath(root: JSONObject, path: String, value: String) {
        val segs = path.split(".")
        var node = root
        for (i in 0 until segs.size - 1) {
            node = node.optJSONObject(segs[i]) ?: JSONObject().also { node.put(segs[i], it) }
        }
        node.put(segs.last(), value)
    }

    private fun lookupTool(op: String): Tool? {
        // Bridge built-in media tools (切歌): media_<action> → MediaController, no registry entry needed.
        if (op.startsWith("media_")) return Tool(op.removePrefix("media_"), "none", JSONArray(), "media")
        val tools = loadRegistry()?.optJSONArray("tools") ?: return null
        for (i in 0 until tools.length()) {
            val t = tools.getJSONObject(i)
            if (t.getString("id") == op) {
                return Tool(
                    t.optString("methodName", t.optString("name")),
                    t.optString("pattern", "none"),
                    t.optJSONArray("devicePaths") ?: JSONArray(),
                    t.optString("mechanism", "aidl"),
                    t
                )
            }
        }
        return null
    }

    private fun loadRegistry(): JSONObject? {
        registry?.let { return it }
        val ext = File(filesDir, REGISTRY_FILE)
        val txt = try { ext.readText() } catch (e: Exception) { return null }
        registry = try { JSONObject(txt) } catch (e: Exception) { null }
        return registry
    }

    private fun readCmd(): Cmd? = try {
        val obj = JSONObject(cmdFile.readText())
        Cmd(obj.optString("reqId"), obj.getString("op"), obj.optJSONObject("args") ?: JSONObject())
    } catch (e: Exception) { null }

    private fun writeResult(reqId: String, ok: Boolean, error: String?, data: JSONObject?) {
        try {
            val out = JSONObject()
            out.put("reqId", reqId)
            out.put("ok", ok)
            if (data != null) out.put("data", data)
            if (error != null) out.put("error", error)
            resultFile.writeText(out.toString())
        } catch (e: Exception) { Log.e(TAG, "writeResult failed", e) }
    }
}
