package com.immotors.imaudio_service.adapter

import android.os.RemoteCallbackList
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.immotors.imaudio_service.utils.JsonUtil
import com.immotors.imaudio_service.config.BeosonicPoint
import com.immotors.imaudio_service.config.EffectModeAndFB
import com.immotors.imaudio_service.config.EffectRequest
import com.immotors.imaudio_service.config.EffectSignalData
import com.immotors.imaudio_service.config.FastAudioMode
import com.immotors.imaudio_service.config.ICloudServiceRequest
import com.immotors.aidl.IIMAudioCallback
import com.immotors.aidl.IIMAudioService
import com.immotors.imaudio_service.IMAudioManager
import com.immotors.imaudio_service.config.PreviewSoundStatus
import com.immotors.imaudio_service.utils.Logger
import com.immotors.imaudio_service.utils.ServiceMessageHandler
import kotlinx.coroutines.runBlocking

/**
 * 音频服务对外通信适配器。
 *
 * 对应原项目 `adaptor/IMAudioServiceAdapter.ts`（原基于 UBus/DBus）。
 * 这里实现为 AIDL [IIMAudioService.Stub]，将 App 的跨进程调用委托给核心协调器
 * [IMAudioManager]，并监听 [ServiceMessageHandler] 的 4 个事件信号，
 * 通过 [RemoteCallbackList] 回调广播给所有已注册的 App。
 *
 * 入参/返回值统一用 JSON 字符串承载，返回结构为 { code, message, methodName, data }。
 */
class IMAudioServiceAdapter private constructor(
    private val mManager: IMAudioManager
) {
    private val callbacks = RemoteCallbackList<IIMAudioCallback>()

    private var soundStatusListener: ((Array<out Any?>) -> Unit)? = null
    private var previewStatusListener: ((Array<out Any?>) -> Unit)? = null
    private var localLibraryListener: ((Array<out Any?>) -> Unit)? = null
    private var effectLibraryListener: ((Array<out Any?>) -> Unit)? = null
    private var effectModeUpdateListener: ((Array<out Any?>) -> Unit)? = null
    private var fastAudioModeChangeListener: ((Array<out Any?>) -> Unit)? = null
    private var micVolUpdateListener: ((Array<out Any?>) -> Unit)? = null

    /**
     * AIDL Binder 实现，供 [com.immotors.imaudio_service.IMAudioService.onBind] 返回。
     */
    val binder: IIMAudioService.Stub = object : IIMAudioService.Stub() {

        override fun registerCallback(callback: IIMAudioCallback?) {
            if (callback != null) callbacks.register(callback)
        }

        override fun unregisterCallback(callback: IIMAudioCallback?) {
            if (callback != null) callbacks.unregister(callback)
        }

        override fun querySoundLibrary(paramJson: String): String {
            return runCatching {
                val param = parseRequest(paramJson)
                val response = runBlocking { mManager.querySoundList(param) }
                Logger.i(TAG, "querySoundLibrary response= success")
                buildResponse("querySoundLibrary", data = response)
            }.getOrElse { buildError("querySoundLibrary", it) }
        }

        override fun deleteSoundLibrary(paramJson: String): String {
            return runCatching {
                val param = parseRequest(paramJson)
                val data = mManager.deleteSoundLibrary(param)
                Logger.i(TAG, "deleteSoundLibrary response= success")
                val result = buildResponse("deleteSoundLibrary", data = data)
                ServiceMessageHandler.emit(EVENT_UPDATE_LOCAL_SOUND_LIBRARY)
                result
            }.getOrElse { buildError("deleteSoundLibrary", it) }
        }

        override fun installSoundLibrary(paramJson: String): String {
            return runCatching {
                val param = parseRequest(paramJson)
                runBlocking { mManager.installSoundLibrary(param) }
                Logger.i(TAG, "installSoundLibrary response= success")
                buildResponse("installSoundLibrary")
            }.getOrElse { buildError("installSoundLibrary", it) }
        }

        override fun previewSound(paramJson: String): String {
            return runCatching {
                val param = parseRequest(paramJson)
                mManager.previewSound(param)
                Logger.i(TAG, "previewSound response= success")
                buildResponse("previewSound")
            }.getOrElse { buildError("previewSound", it) }
        }

        override fun queryCurrentActiveSound(): String {
            return runCatching {
                val data = mManager.queryCurrentActiveSound()
                Logger.i(TAG, "queryCurrentActiveSound response= success")
                buildResponse("queryCurrentActiveSound", data = data)
            }.getOrElse { buildError("queryCurrentActiveSound", it) }
        }

        override fun queryEffectLibrary(paramJson: String): String {
            return runCatching {
                val body = JsonUtil.fromJson<EffectRequest>(paramJson)
                val data = mManager.queryEffectLibrary(body.sourceType)
                Logger.i(TAG, "queryEffectLibrary data=${data.size}")
                buildResponse("queryEffectLibrary", data = data)
            }.getOrElse { buildError("queryEffectLibrary", it) }
        }

        override fun addEffect(paramJson: String): String {
            return runCatching {
                val param = parseRequest(paramJson)
                runBlocking { mManager.addEffect(param) }
                buildResponse("addEffect")
            }.getOrElse { buildError("addEffect", it) }
        }

        override fun updateEffect(paramJson: String): String {
            return runCatching {
                val param = parseRequest(paramJson)
                mManager.updateEffect(param)
                buildResponse("updateEffect")
            }.getOrElse { buildError("updateEffect", it) }
        }

        override fun deleteEffect(paramJson: String): String {
            return runCatching {
                val param = parseRequest(paramJson)
                mManager.deleteEffect(param)
                buildResponse("deleteEffect")
            }.getOrElse { buildError("deleteEffect", it) }
        }

        override fun getEffectShareCode(paramJson: String): String {
            return runCatching {
                val param = parseRequest(paramJson)
                val data = runBlocking { mManager.getEffectShareCode(param) }
                Logger.i(TAG, "getEffectShareCode data=${JsonUtil.toJson(data)}")
                buildResponse("getEffectShareCode", data = data)
            }.getOrElse { buildError("getEffectShareCode", it) }
        }

        override fun addEffectByShareCode(paramJson: String): String {
            return runCatching {
                val param = parseRequest(paramJson)
                val data = runBlocking { mManager.addEffectByShareCode(param) }
                buildResponse("addEffectByShareCode", data = data)
            }.getOrElse { buildError("addEffectByShareCode", it) }
        }

        override fun saveCurrentEffectData(paramJson: String): String {
            return runCatching {
                val param = parseRequest(paramJson)
                mManager.saveCurrentEffectData(param)
                buildResponse("saveCurrentEffectData")
            }.getOrElse { buildError("saveCurrentEffectData", it) }
        }

        // ── Beosonic 均衡器 ────────────────────────────────────────

        override fun setBeosonicPoint(paramJson: String): String {
            return runCatching {
                val point = JsonUtil.fromJson<BeosonicPoint>(paramJson)
                val result = runBlocking { mManager.setBeosonicPoint(point) }
                Logger.i(TAG, "setBeosonicPoint x=${point.x} y=${point.y} z=${point.z} result=$result")
                buildResponse("setBeosonicPoint", data = result)
            }.getOrElse { buildError("setBeosonicPoint", it) }
        }

        // ── 音场模式（AudioPolicyProxy）──────────────────────────

        override fun getSoundStage(): String {
            return runCatching {
                val data = runBlocking { mManager.getSoundStage() }
                Logger.i(TAG, "getSoundStage data=${JsonUtil.toJson(data)}")
                buildResponse("getSoundStage", data = data)
            }.getOrElse { buildError("getSoundStage", it) }
        }

        override fun setSoundStage(paramJson: String): String {
            return runCatching {
                val param = JsonUtil.fromJson<EffectModeAndFB>(paramJson)
                val result = runBlocking { mManager.setSoundStage(param.mode, param.fade, param.balance) }
                Logger.i(TAG, "setSoundStage result=$result")
                buildResponse("setSoundStage", data = result)
            }.getOrElse { buildError("setSoundStage", it) }
        }

        // ── 整车/头枕音量（AudioPolicyProxy）──────────────────────

        override fun setCarAndHeadrestVolume(paramJson: String): String {
            return runCatching {
                val param = parseJsonObject(paramJson)
                val volume = intArg(param, "volume", 0)
                val streamType = intArg(param, "streamType", 0)
                val zoneId = optionalIntArg(param, "zoneId")
                val result = runBlocking { mManager.setCarAndHeadrestVolume(volume, streamType, zoneId) }
                Logger.i(TAG, "setCarAndHeadrestVolume result=$result")
                buildResponse("setCarAndHeadrestVolume", data = result)
            }.getOrElse { buildError("setCarAndHeadrestVolume", it) }
        }

        override fun getLastVolumeData(paramJson: String): String {
            return runCatching {
                val param = parseJsonObject(paramJson)
                val streamType = intArg(param, "streamType", 0)
                val zoneId = optionalIntArg(param, "zoneId")
                val result = runBlocking { mManager.getLastVolumeData(streamType, zoneId) }
                Logger.i(TAG, "getLastVolumeData result=$result")
                buildResponse("getLastVolumeData", data = result)
            }.getOrElse { buildError("getLastVolumeData", it) }
        }

        // ── 麦克风音量（AudioPolicyProxy）──────────────────────────

        override fun setMicVocal(paramJson: String): String {
            return runCatching {
                val param = parseJsonObject(paramJson)
                val vol = intArg(param, "vol", 0)
                val result = runBlocking { mManager.setMicVocal(vol) }
                Logger.i(TAG, "setMicVocal result=$result")
                buildResponse("setMicVocal", data = result)
            }.getOrElse { buildError("setMicVocal", it) }
        }

        override fun getMicVocal(): String {
            return runCatching {
                val result = runBlocking { mManager.getMicVocal() }
                Logger.i(TAG, "getMicVocal result=$result")
                buildResponse("getMicVocal", data = result)
            }.getOrElse { buildError("getMicVocal", it) }
        }

        // ── K歌混响模式（AudioPolicyProxy）──────────────────────────

        override fun setFastAudioMode(paramJson: String): String {
            return runCatching {
                val param = parseJsonObject(paramJson)
                val modeValue = intArg(param, "mode", 0)
                val mode = FastAudioMode.entries.firstOrNull { it.value == modeValue } ?: FastAudioMode.NORMAL
                val result = runBlocking { mManager.setFastAudioMode(mode) }
                Logger.i(TAG, "setFastAudioMode mode=$mode result=$result")
                buildResponse("setFastAudioMode", data = result)
            }.getOrElse { buildError("setFastAudioMode", it) }
        }

        override fun getFastAudioMode(): String {
            return runCatching {
                val result = runBlocking { mManager.getFastAudioMode() }
                Logger.i(TAG, "getFastAudioMode result=$result")
                buildResponse("getFastAudioMode", data = result)
            }.getOrElse { buildError("getFastAudioMode", it) }
        }

        // ── 随速音量补偿(VNC)──────────────────────────────────────

        override fun getSpeedVolumeStatus(): String {
            return runCatching {
                // VNC 随速音量补偿：当前返回 stub 空数据，待后续接入 audiopolicyservice
                buildResponse("getSpeedVolumeStatus", data = null)
            }.getOrElse { buildError("getSpeedVolumeStatus", it) }
        }

        override fun setSpeedVolumeStatus(paramJson: String): String {
            return runCatching {
                // VNC 随速音量补偿：当前返回 stub false，待后续接入 audiopolicyservice
                buildResponse("setSpeedVolumeStatus", data = false)
            }.getOrElse { buildError("setSpeedVolumeStatus", it) }
        }
    }

    init {
        Logger.i(TAG, "adapter constructor")
        registerSignals()
    }

    private fun parseRequest(paramJson: String): ICloudServiceRequest {
        return JsonUtil.fromJson<ICloudServiceRequest>(paramJson)
    }

    private fun parseJsonObject(paramJson: String): JsonObject {
        return JsonParser.parseString(paramJson).asJsonObject
    }

    private fun intArg(param: JsonObject, key: String, defaultValue: Int): Int {
        val value = param.get(key)
        return if (value == null || value.isJsonNull) defaultValue else value.asInt
    }

    private fun optionalIntArg(param: JsonObject, key: String): Int? {
        val value = param.get(key)
        return if (value == null || value.isJsonNull) null else value.asInt
    }

    private fun buildResponse(methodName: String, code: Int = 1000, message: String = "SUCCESS", data: Any? = null): String {
        val map = mutableMapOf<String, Any?>(
            "code" to code,
            "message" to message,
            "methodName" to methodName
        )
        if (data != null) {
            map["data"] = data
        }
        return JsonUtil.toJson(map)
    }

    private fun buildError(methodName: String, error: Throwable): String {
        Logger.e(TAG, "$methodName:: err", error.toString())
        return JsonUtil.toJson(
            mapOf(
                "code" to -1,
                "message" to (error.message ?: error.toString()),
                "methodName" to methodName
            )
        )
    }

    private fun registerSignals() {
        Logger.i(TAG, "add signals start")

        soundStatusListener = ServiceMessageHandler.on(EVENT_SOUND_STATUS_CHANGE) { args ->
            val soundStatus = (args.getOrNull(0) as? Int) ?: return@on
            val resourceCode = (args.getOrNull(1) as? String) ?: ""
            val lastSlot = (args.getOrNull(2) as? String) ?: ""
            Logger.i(TAG, "soundStatusChangeSignal soundStatus=$soundStatus resourceCode=$resourceCode lastSlot=$lastSlot")
            broadcast { it.onSoundStatusChange(soundStatus, resourceCode, lastSlot) }
        }

        previewStatusListener = ServiceMessageHandler.on(EVENT_PREVIEW_SOUND_STATUS) { args ->
            val previewSoundStatus = args.getOrNull(0) as? PreviewSoundStatus ?: return@on
            Logger.i(TAG, "previewSoundStatusSignal=${JsonUtil.toJson(previewSoundStatus)}")
            broadcast { it.onPreviewSoundStatus(JsonUtil.toJson(previewSoundStatus)) }
        }

        localLibraryListener = ServiceMessageHandler.on(EVENT_UPDATE_LOCAL_SOUND_LIBRARY) {
            Logger.i(TAG, "updateLocalSoundLibrary")
            broadcast { it.onLocalSoundLibraryUpdate(true) }
        }

        effectLibraryListener = ServiceMessageHandler.on(EVENT_EFFECT_LIBRARY_CHANGE) { args ->
            val data = args.getOrNull(0) as? EffectSignalData ?: return@on
            Logger.i(TAG, "effectLibraryChangeSignal data=${JsonUtil.toJson(data)}")
            broadcast { it.onEffectLibraryChange(JsonUtil.toJson(data)) }
        }

        // ── 音场模式变更信号 ──────────────────────────────────────

        effectModeUpdateListener = ServiceMessageHandler.on(EVENT_EFFECT_MODE_UPDATE) { args ->
            val mode = args.getOrNull(0) as? EffectModeAndFB ?: return@on
            Logger.i(TAG, "effectModeUpdateSignal mode=${JsonUtil.toJson(mode)}")
            broadcast { it.onEffectModeUpdate(JsonUtil.toJson(mode)) }
        }

        // ── K歌混响模式变更信号 ──────────────────────────────────

        fastAudioModeChangeListener = ServiceMessageHandler.on(EVENT_FAST_AUDIO_MODE_CHANGE) { args ->
            val modeValue = (args.getOrNull(0) as? Int) ?: return@on
            val mode = FastAudioMode.entries.firstOrNull { it.value == modeValue } ?: FastAudioMode.NORMAL
            Logger.i(TAG, "fastAudioModeChangeSignal mode=$mode")
            broadcast { it.onFastAudioModeChange(mode.value) }
        }

        // ── 麦克风音量变更信号 ──────────────────────────────────

        micVolUpdateListener = ServiceMessageHandler.on(EVENT_MIC_VOL_UPDATE) { args ->
            val vol = (args.getOrNull(0) as? Int) ?: return@on
            Logger.i(TAG, "micVolUpdateSignal vol=$vol")
            broadcast { it.onMicVolUpdate(vol) }
        }
    }

    private inline fun broadcast(action: (IIMAudioCallback) -> Unit) {
        val count = callbacks.beginBroadcast()
        try {
            for (index in 0 until count) {
                runCatching { action(callbacks.getBroadcastItem(index)) }
            }
        } finally {
            callbacks.finishBroadcast()
        }
    }

    private fun destroy() {
        Logger.i(TAG, "destroy")
        soundStatusListener?.let { ServiceMessageHandler.off(EVENT_SOUND_STATUS_CHANGE, it) }
        previewStatusListener?.let { ServiceMessageHandler.off(EVENT_PREVIEW_SOUND_STATUS, it) }
        localLibraryListener?.let { ServiceMessageHandler.off(EVENT_UPDATE_LOCAL_SOUND_LIBRARY, it) }
        effectLibraryListener?.let { ServiceMessageHandler.off(EVENT_EFFECT_LIBRARY_CHANGE, it) }
        effectModeUpdateListener?.let { ServiceMessageHandler.off(EVENT_EFFECT_MODE_UPDATE, it) }
        fastAudioModeChangeListener?.let { ServiceMessageHandler.off(EVENT_FAST_AUDIO_MODE_CHANGE, it) }
        micVolUpdateListener?.let { ServiceMessageHandler.off(EVENT_MIC_VOL_UPDATE, it) }
        callbacks.kill()
    }

    companion object {
        private val TAG = com.immotors.imaudio_service.config.TAG.ADAPTER
        private const val EVENT_SOUND_STATUS_CHANGE = "soundStatusChangeSignal"
        private const val EVENT_PREVIEW_SOUND_STATUS = "previewSoundStatusSignal"
        private const val EVENT_UPDATE_LOCAL_SOUND_LIBRARY = "updateLocalSoundLibrary"
        private const val EVENT_EFFECT_LIBRARY_CHANGE = "effectLibraryChangeSignal"
        private const val EVENT_EFFECT_MODE_UPDATE = "effectModeUpdateSignal"
        private const val EVENT_FAST_AUDIO_MODE_CHANGE = "fastAudioModeChangeSignal"
        private const val EVENT_MIC_VOL_UPDATE = "micVolUpdateSignal"

        @Volatile
        private var instance: IMAudioServiceAdapter? = null

        fun getInstance(manager: IMAudioManager): IMAudioServiceAdapter {
            return instance ?: synchronized(this) {
                instance ?: IMAudioServiceAdapter(manager).also { instance = it }
            }
        }

        fun releaseInstance() {
            instance?.destroy()
            instance = null
        }
    }
}
