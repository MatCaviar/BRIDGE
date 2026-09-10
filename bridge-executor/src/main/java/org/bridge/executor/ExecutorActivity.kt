package org.bridge.executor

import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.content.ServiceConnection
import android.media.session.MediaSessionManager
import android.os.Binder
import android.os.Bundle
import android.os.IBinder
import android.os.Parcel
import org.json.JSONObject
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Target contracts and permissions live in the integrator's adapter directory and registry. */
class ExecutorActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val requestId = intent.getStringExtra("requestId") ?: ""
        if (!requestId.matches(Regex("[A-Za-z0-9_-]{1,100}"))) { finish(); return }
        val mailbox = File(filesDir, "bridge-rpc/$requestId")
        Thread {
            try {
                val request = JSONObject(File(mailbox, "cmd.json").readText())
                require(request.getString("reqId") == requestId) { "REQUEST_ID_MISMATCH" }
                val registry = JSONObject(File(filesDir, "registry.json").readText())
                val entries = registry.getJSONArray("tools")
                val op = request.getString("op")
                val tool = (0 until entries.length()).map { entries.getJSONObject(it) }.firstOrNull { it.getString("id") == op }
                    ?: throw IllegalArgumentException("UNKNOWN_OP $op")
                require(tool.optString("status") != "broken") { "CAPABILITY_UNAVAILABLE" }
                checkPreconditions(tool)
                val args = request.optJSONObject("args") ?: JSONObject()
                val response = when (tool.getString("mechanism")) {
                    "intent" -> launchTarget(tool, args)
                    "media" -> media(tool)
                    "aidl", "execmd" -> boundCall(tool, args)
                    else -> throw IllegalArgumentException("UNSUPPORTED_MECHANISM")
                }
                // The executor reports transport completion. Business codes are interpreted once by the host contract.
                writeResult(mailbox, requestId, true, response, null)
            } catch (e: Exception) {
                writeResult(mailbox, requestId, false, null, e.cause?.message ?: e.message ?: "EXECUTOR_ERROR")
            } finally { runOnUiThread { finish() } }
        }.start()
    }

    private fun checkPreconditions(tool: JSONObject) {
        val safety = tool.optString("safetyLevel", "normal")
        val required = mutableSetOf<String>()
        tool.optJSONArray("preconditions")?.let { values -> for (i in 0 until values.length()) required.add(values.getString(i)) }
        if (safety.startsWith("p_gear")) required.add("park")
        if (safety.contains("confirm")) required.add("confirmed")
        if (safety.contains("network")) required.add("network")
        if (required.isEmpty()) return
        // A trusted device-side integration supplies a short-lived state snapshot, independent of call arguments.
        val state = JSONObject(File(filesDir, "preconditions.json").readText())
        require(state.getLong("expiresAt") > System.currentTimeMillis()) { "PRECONDITIONS_EXPIRED" }
        val values = state.getJSONObject("values")
        for (key in required) require(values.opt(key) == true) { "PRECONDITION_UNSATISFIED $key" }
    }

    private fun boundCall(tool: JSONObject, args: JSONObject): JSONObject {
        val bound = CountDownLatch(1)
        var remote: IBinder? = null
        val connection = object : ServiceConnection {
            override fun onServiceConnected(name: ComponentName?, service: IBinder?) { remote = service; bound.countDown() }
            override fun onServiceDisconnected(name: ComponentName?) { remote = null }
        }
        val target = Intent().apply {
            component = ComponentName(tool.getString("servicePackage"), tool.getString("serviceClass"))
            if (tool.has("bindAction")) action = tool.getString("bindAction")
        }
        require(bindService(target, connection, BIND_AUTO_CREATE)) { "BIND_FAILED" }
        try {
            require(bound.await(tool.optLong("timeoutMs", 5000), TimeUnit.MILLISECONDS)) { "BIND_TIMEOUT" }
            val binder = remote ?: throw IllegalStateException("SERVICE_DISCONNECTED")
            if (tool.getString("mechanism") == "execmd") return jsonBinderCall(binder, tool, args)
            val stub = Class.forName(tool.getString("interfaceClass") + "\$Stub")
            val proxy = stub.getMethod("asInterface", IBinder::class.java).invoke(null, binder)
                ?: throw IllegalStateException("NO_PROXY")
            val method = tool.getString("methodName")
            val result = if (tool.optString("pattern") == "none") proxy.javaClass.getMethod(method).invoke(proxy)
                else proxy.javaClass.getMethod(method, String::class.java).invoke(proxy, args.toString())
            return parseResponse(result as? String)
        } finally { unbindService(connection) }
    }

    /** Configurable AIDL wire: (String JSON, callback binder) -> callback(String JSON). */
    private fun jsonBinderCall(remote: IBinder, tool: JSONObject, args: JSONObject): JSONObject {
        val config = tool.getJSONObject("binder")
        val descriptor = config.getString("descriptor")
        require(remote.interfaceDescriptor == descriptor) { "BINDER_DESCRIPTOR_MISMATCH" }
        val callbackDescriptor = config.getString("callbackDescriptor")
        val callbackCode = config.getInt("callbackTransactionCode")
        val requestCode = config.getInt("transactionCode")
        require(callbackCode >= IBinder.FIRST_CALL_TRANSACTION && requestCode >= IBinder.FIRST_CALL_TRANSACTION) { "INVALID_TRANSACTION_CODE" }
        val latch = CountDownLatch(1)
        var response: String? = null
        val callback = object : Binder() {
            override fun onTransact(code: Int, data: Parcel, reply: Parcel?, flags: Int): Boolean {
                if (code == IBinder.INTERFACE_TRANSACTION) { reply?.writeString(callbackDescriptor); return true }
                if (code != callbackCode) return super.onTransact(code, data, reply, flags)
                data.enforceInterface(callbackDescriptor)
                response = data.readString()
                reply?.writeNoException()
                latch.countDown()
                return true
            }
        }
        val payload = JSONObject().apply {
            put(config.optString("operationField", "command"), tool.getString("methodName"))
            put(config.optString("argumentsField", "params"), if (config.optBoolean("stringifyArguments", true)) args.toString() else args)
        }
        val data = Parcel.obtain()
        val reply = Parcel.obtain()
        try {
            data.writeInterfaceToken(descriptor)
            data.writeString(payload.toString())
            data.writeStrongBinder(callback)
            val oneWay = config.optBoolean("oneWay", false)
            require(remote.transact(requestCode, data, if (oneWay) null else reply, if (oneWay) IBinder.FLAG_ONEWAY else 0)) { "TRANSACTION_REJECTED" }
            if (!oneWay) reply.readException()
            require(latch.await(tool.optLong("timeoutMs", 5000), TimeUnit.MILLISECONDS)) { "CALLBACK_TIMEOUT" }
            return parseResponse(response)
        } finally { data.recycle(); reply.recycle() }
    }

    private fun launchTarget(tool: JSONObject, args: JSONObject): JSONObject {
        val target = tool.getJSONObject("component")
        val launch = Intent().apply {
            component = ComponentName(target.getString("pkg"), target.getString("cls"))
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            tool.optJSONArray("extras")?.let { extras ->
                for (i in 0 until extras.length()) {
                    val extra = extras.getJSONObject(i)
                    putExtra(extra.getString("key"), if (extra.optBoolean("fromArgs")) args.toString() else extra.getString("value"))
                }
            }
            if (tool.has("dataUri")) data = android.net.Uri.parse(tool.getString("dataUri"))
        }
        startActivity(launch)
        return JSONObject().put("code", 0).put("message", "Activity launch requested").put("data", JSONObject().put("dispatched", true)).put("extras", JSONObject())
    }

    private fun media(tool: JSONObject): JSONObject {
        val manager = getSystemService(MediaSessionManager::class.java)
        val targetPackage = tool.optString("sessionPackage", "")
        val sessions = manager.getActiveSessions(null).filter { targetPackage.isEmpty() || it.packageName == targetPackage }
        require(sessions.size == 1) { "MEDIA_SESSION_NOT_UNIQUE" }
        val controls = sessions[0].transportControls
        when (tool.getString("methodName")) {
            "play" -> controls.play()
            "pause" -> controls.pause()
            "next" -> controls.skipToNext()
            "prev" -> controls.skipToPrevious()
            else -> throw IllegalArgumentException("UNKNOWN_MEDIA_ACTION")
        }
        return JSONObject().put("code", 0).put("message", "Playback command dispatched").put("data", JSONObject().put("dispatched", true)).put("extras", JSONObject())
    }

    private fun parseResponse(raw: String?): JSONObject {
        require(!raw.isNullOrBlank()) { "EMPTY_RESPONSE" }
        return JSONObject(raw)
    }

    private fun writeResult(dir: File, id: String, ok: Boolean, data: JSONObject?, error: String?) {
        dir.mkdirs()
        val result = JSONObject().put("reqId", id).put("ok", ok)
        if (data != null) result.put("data", data)
        if (error != null) result.put("error", error)
        val pending = File(dir, "result.pending")
        pending.writeText(result.toString())
        require(pending.renameTo(File(dir, "result.json"))) { "RESULT_WRITE_FAILED" }
    }
}
