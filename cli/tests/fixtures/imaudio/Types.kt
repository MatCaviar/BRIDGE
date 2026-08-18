package com.immotors.imaudio_service.config

import android.content.Context
import android.media.AudioManager
import android.provider.Settings

enum class SoundLibraryType(val value: String) {
    DOWNLOAD("local"),
    CLOUD("cloud")
}

enum class SoundSlotType(val value: Int) {
    DEFAULT(1), // 默认音效槽位
    OPERATIONAL(3), // 运营
    OFFICIALANDCUSTOM(4), // 官方 + 自定义
}

enum class VoiceType(val value: Int) {
    DEFAULT(0), // 默认
    OFFICIAL(1), // 官方
    CUSTOM(2), // 自定义
    OPERATIONAL(3), // 运营
}

enum class PreviewSoundType(val value: Int) {
    UNLOCK(0), // 解锁
    LOCK(1), // 闭锁
}

enum class SoundDownloadInstallStatus(val value: Int) {
    WAIT_FOR_DOWNLOAD(0), //发起下载请求
    DOWNLOADING(1), //下载中
    DOWNLOAD_SUCCESS(2), //下载成功
    DOWNLOAD_FAIL(3), //下载失败
    ACTIVING(4), // 安装中
    ACTIVE_SUCCESS(5), // 安装成功
    ACTIVE_FAIL(6), // 安装失败
    DELETING(7), // 删除中
    DELETE_SUCCESS(8), // 删除成功
    DELETE_FAIL(9), // 删除失败
    UNKNOWN(10), // 资源不存在
    DOWNLOAD_FAIL_LIMIT_EXCEEDED(11), // 下载失败 超过限制
}

enum class PreviewStatus(val value: Int) {
    LOADING(1), // 正在加载
    PLAYING(2), // 播放中
    FINISH(3), // 播放完成
    ERROR(4), // 播放失败
    NONE_EXIT(5), // 资源不存在
}

enum class EffectSourceType(val value: Int) {
    OFFICIAL(0), // 官方
    CUSTOM(1) // 自定义
}

enum class EffectOperationType(val value: Int) {
    ADD(1),
    UPDATE(2),
    DELETE(3)
}

enum class EffectOperationResultType(val value: Int) {
    SUCCESS(0),
    FAILED(1)
}

// SoundPathConstants 已迁移至 SoundPathManager 类，使用 Context 动态获取 Android 路径
// 参考：com.immotors.imaudio_service.control.SoundPathManager

const val SOUND_DOWNLOADLIBRARY_MAX = 11
const val SOUND_DOWNLOADLIBRARY_Limit_Exceeded = "Limit Exceeded"
const val SOUND_DEFAULT_RESOURCECODE = "default"
const val EFFECT_MAX_Limit = 200
const val SOUND_EXPIRATION_MAX_Time = 2147483647L

// 可配置的文件大小限制（单位：字节）
const val MAX_FILE_SIZE_BYTES = 320 * 1024L // 320KB


// 云端接口请求参数
data class QuerySoundLibraryParam(
    val soundType: String? = null, // carlock
    val pathType: String,
    val vin: String,
    val voiceType: String? = null,
    val pageNumber: String,
    val pageSize: String
)

data class DeleteSoundResourceDataParam(
    val soundType: String, // carlock
    val resourceCode: List<DeleteSoundResourceData>
)

data class DeleteSoundResourceData(
    val resourceCode: String,
    val soundStatus: Int
)

data class CommonResponse<T>(
    val methodName: String,
    val code: Int,
    val data: T? = null
)

// 云端接口请求参数
/**
 * 云端接口请求参数
 * 
 * body 使用 Map<String, Any> 存储动态参数，取值时需进行安全的类型转换：
 * 
 * 【类型转换规范】
 * 1. 简单类型（必须使用 as? 安全转换 + 默认值）：
 *    - 字符串: val str = body["key"] as? String ?: ""
 *    - 整数:   val num = (body["key"] as? Number)?.toInt() ?: 0
 *    - 布尔:   val bool = body["key"] as? Boolean ?: false
 * 
 * 2. 列表类型：
 *    - val list = (body["key"] as? List<*>)?.filterIsInstance<String>() ?: emptyList()
 * 
 * 3. 复杂对象（推荐通过 JSON 中转）：
 *    - val obj = JsonUtil.fromJson<EffectInfo>(JsonUtil.toJson(body))
 * 
 * ⚠️ 禁止直接使用 as 强制转换，应始终使用 as? 避免 ClassCastException
 */
data class ICloudServiceRequest(
    val body: Map<String, Any>,
    val headers: Map<String, String> = mapOf(
        "token" to ""
    ), // 必传 token
    val options: Map<String, String>? = null // 可不传，默认填充
)

data class QuerySoundLibraryResponseData(
    val pageNum: Int,
    val pageSize: Int,
    val total: Int,
    val list: List<SoundResourceData>
)

data class QuerySoundLibraryResponse(
    val code: Int,
    val message: String,
    val data: QuerySoundLibraryResponseData,
    val methodName: String? = null
)

data class QuerySendSoundResponse(
    val code: Int,
    val message: String,
    val data: List<SoundResourceData>
)

data class CMNSData(
    val vin: String,
    val templateParam: TemplateParam,
    val appCode: String,
    val templateId: String,
    val callOrigin: String
)

data class TemplateParam(
    val messageId: String,
    val timestamp: Long
)

data class SoundResourceData(
    val resourceCode: String, // 语音资源 id
    val resourceName: String, // 资源名称
    val publishDate: String? = null, // 发布时间 13 位时间戳
    val previewImage: String? = null, // 预览图地址
    val unlockVoiceUrl: String? = null, // 解锁语音地址
    val lockVoiceUrl: String? = null, // 闭锁语音地址
    val voiceType: Int, //0 默认 1:官方 2：自定义 3：运营
    val effectiveDate: String? = null, // 生效日期 13 位时间戳
    val expirationDate: String? = null, // 失效日期 13 位时间戳
    val installStatus: Boolean? = null, // false 未安装 true 已安装
    var soundStatus: Int? = null, //  0 未下载，1 下载中，2 下载完成，3 下载失败 4 安装中 5 安装完成 6 安装失败 7 删除中 8 删除成功 9 删除失败
    val status: Int? = null, // 5：打包完成 7:app 已下发
    val needImmediate: Boolean? = null, // 是否需要立即生效
    val timestamp: Long? = null,
    val unlockVoice: String? = null, // 资源包解锁名
    val lockVoice: String? = null, // 资源包闭锁名
    val lockPCM: PCMResult? = null, // 闭锁播放参数
    val unlockPCM: PCMResult? = null, // 解锁播放参数
    val soundType: String? = null, // carlock
    val from: String? = null, // app car operation
    val isDeliverType: Int? = null, // 1 交付音效 其他值 不是交付音效
    val downloadProgress: Int? = null,
)

data class PCMResult(
    val errorCode: Int,
    val channelLayout: Int,
    val sampleRate: Int,
    val sampleFmt: Int
)

data class DspSoundMessage(
    val soundSlotType: SoundSlotType, // 音频类型：默认，自定义，运营
    val soundSlot: String // 音频位置：默认，自定义，运营
)

data class PreviewSound(
    val resourceCode: String,
    val voiceType: Int, //0 解锁 1 闭锁
    val vin: String,
    val soundType: String
)

data class PreviewSoundStatus(
    val resourceCode: String? = null,
    val previewStatus: PreviewStatus? = null,
    val voiceType: Int? = null //0 解锁 1 闭锁
)

data class DspSlotMsgs(
    val slot: Int,
    val resourceCode: String
)

data class VehicleTypes(
    val Default: List<String>,
    val Beosonic: List<String>
)

data class EffectRequest(
    val sourceType: Int
)

data class EffectConfig(
    val Default: List<EffectInfo>,
    val Beosonic: List<EffectInfo>
)

/**
 * effect_config.json 的顶层结构，包含均衡器配置和车型分类。
 */
data class EffectConfigRoot(
    val EFFECT_CONFIG: EffectConfig,
    val VEHICLETYPE: VehicleTypes
)

data class EffectInfo(
    val vin: String? = null,
    val effectId: String, // 0 经典流行 1 温暖柔和 2 清澈人声 3 超重低音 自定义：id 根据时间戳生成
    val name: String = "", // 均衡器名称（官方均衡器由资源数组填充，自定义均衡器由用户输入）
    val effectValues: List<String>, // CM2/CT1：[ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ] F：[x,y,z]
    val content: String? = null, // 自定义详情内容
    val sourceType: EffectSourceType? = null,
    val shareCode: String? = null, // 分享码
    val commonValues: String? = null, // 扩展字段：存放通用的信息，UI 自定义，自己管理，json 格式
    val createTime: String? = null, // 当前时间戳 13 位
    val updateTime: String? = null // 时间戳 13 位，新建的时候为当前时间戳
)

data class InstallSoundLibrary(
    val resourceCode: String,
    val timestamp: Long? = null, // 发起下载的时间戳
    val soundType: String, // carlock
    val soundStatus: Int? = null,
    val voiceType: Int? = null, // 1:官方 2：自定义 3：运营
    val from: String? = null // app car operation
)

data class CMNSLinkData(
    val cmns_data: CMNSLinkMsg,
    val messageId: String,
    val `package`: String,
    val timstamp: Int
)

data class CMNSLinkMsg(
    val mid: Int,
    val rmid: String
)

data class EffectResponse(
    val effectLibrary: List<EffectInfo>
)

data class EffectSignalData(
    val operationType: EffectOperationType,
    val status: EffectOperationResultType,
    val effectInfo: EffectInfo? = null,
    val effectId: List<String>? = null
)

/**
 * 通用 JSON 对象类型别名。
 * 对应原 TS 的 `ObjectReflectI`（任意键值对象），用于网络请求参数等场景。
 */
typealias ObjectReflect = MutableMap<String, Any?>

/**
 * 云端通用响应结构。
 * 对应原 TS 的 `CloudResponse`。
 */
data class CloudResponse(
    val code: Int,
    val resultCode: String? = null,
    val message: String? = null,
    val data: Any? = null
)

/**
 * Beosonic 三维声场坐标。
 */
data class BeosonicPoint(
    val x: Int,
    val y: Int,
    val z: Int
)

/**
 * 音场模式 + fade/balance 数据。
 * 对应原 TS AudioPolicyProxy 的 EffectModeAndFB。
 */
data class EffectModeAndFB(
    val mode: Int,
    val fade: Int? = null,
    val balance: Int? = null
)

/**
 * K歌混响模式枚举。
 * 对应原 TS MAFProxy 的 FastAudioModeEnum。
 */
enum class FastAudioMode(val value: Int) {
    NORMAL(0),           // 普通
    RECORDING_STUDIO(1), // 录音棚
    KSONG_ROOM(2)        // K歌房
}

/**
 * 随速音量补偿状态枚举。
 * 对应原 TS SoundStage 的 SpeedVolumeStatus。
 */
enum class SpeedVolumeStatus(val value: String) {
    OFF("off"),  // 关闭
    LOW("low"),  // 低
    MID("mid"),  // 中
    HIGH("high") // 高
}

/**
 * 音场模式枚举。
 * 对应原 TS SoundStage 枚举。
 */
enum class SoundStageMode(val value: Int) {
    CUSTOM(0),                  // 自定义
    HIGH_ORDER_SURROUND(1),     // 沉浸环绕
    PROFESSIONAL_LISTENING_ROOM(2), // 专业听音室
    MINI_CONCERT(3),            // 小型演奏会
    CONCERT_HALL(4),            // 音乐厅
    DRIVER(7),                  // 主驾优先
    REAR_SEAT_VIP(8),           // 后排优先
    ALL_CAR(9),                 // 全车均衡
    PANORAMIC_CINEMA(10),       // 全景影院
    AI_RHINE_VOICE(235),        // AI莱茵之声
    AI_AURORA_WARM(236),        // AI极光暖调
    AI_ENGLAND_STYLE(237),      // AI英伦格调
    AI_AMERICAN_METAL(238)      // AI美式金属
}

enum class SettingsLevel {
    GLOBAL,
    SYSTEM,
    SECURE
}

/**
 * 音频相关全局常量定义
 *
 * 分类说明：
 * 1. AudioManager 硬件/音效参数 → 通过 setParameters / getParameters 读写，实时生效
 * 2. Settings.Global 自定义配置 → JSON 格式持久化，由 SettingsProvider 管理，重启不丢失
 */
object AudioConfig {


    //region ===================== AudioManager 音频硬件 & 音效参数 =====================
    /**
     * Beosonic 3D 三维音效参数
     * 取值范围：
     * BEOSONIC_X：0 ~ 20
     * BEOSONIC_Y：0 ~ 20
     * BEOSONIC_Z：0 ~ 10
     */
    const val BEOSONIC_X = "beosonic_x"
    const val BEOSONIC_Y = "beosonic_y"
    const val BEOSONIC_Z = "beosonic_z"

    /** 全局音效模式配置项 */
    const val SOUND_EFFECT_SETTING = "sound_effect_setting"

    /**
     * 音效模式枚举值
     * 0：至臻原声
     * 1：专业听音室
     * 2：小型演奏会
     * 3：音乐剧场
     * 4：沉浸影院
     * 7：主驾优先
     * 8：后排优先
     */
    const val SOUND_EFFECT_ORIGINAL = 0
    const val SOUND_EFFECT_LISTEN_ROOM = 1
    const val SOUND_EFFECT_SMALL_CONCERT = 2
    const val SOUND_EFFECT_MUSIC_THEATER = 3
    const val SOUND_EFFECT_CINEMA = 4
    const val SOUND_EFFECT_DRIVER_FIRST = 7
    const val SOUND_EFFECT_REAR_FIRST = 8

    /** 左右音量平衡，取值范围：0 ~ 14 */
    const val BALANCE_VOL = "balance_vol"

    /** 前后音量平衡，取值范围：0 ~ 14 */
    const val FADER_VOL = "fader_vol"

    /** 随速音量补偿开关  0=关闭  1=开启 */
    const val SPEED_VOLUME = "speed_volume"

    /** 获取 ADSP 音频处理器版本（仅读参数） */
    const val ADSP_VERSION = "adsp_version"
    //endregion

    //region ===================== Settings.Global 持久化配置 Key =====================
    /**
     * 音场模式配置
     * 存储格式：JSON 字符串
     * 示例：{"model":"0", "fade":-50, "balance":100}
     *
     * model：音效模式ID，对应整机音效场景，取值映射关系：
     *  0 = 至臻原声
     *  1 = 专业听音室
     *  2 = 小型演奏会
     *  3 = 音乐剧场
     *  4 = 沉浸影院
     * fade：前后音量平衡（前后声场偏移），支持正负值，字段可空
     * balance：左右音量平衡（左右声场偏移），支持正负值，字段可空
     * 补充：空字段不传值时，系统保留当前生效配置
     */
    const val SETTINGS_GLOBAL_SOUND_STAGE = "Settings_Gloabal_SOUND_STAGE"

    /**
     * 均衡器效果配置
     * 存储格式：JSON 字符串
     * 示例：{"effectId":"0", "x":0, "y":5, "z":10}
     *
     * effectId：均衡器预设效果ID，取值映射关系：
     *  "0" = 经典时尚
     *  "1" = 温暖柔和
     *  "2" = 清晰人声
     *  "3" = 超重低音
     *  "4" = 自定义1
     *  "5" = 自定义2
     * x：Beosonic 三维音效 X轴参数，字段可空
     * y：Beosonic 三维音效 Y轴参数，字段可空
     * z：Beosonic 三维音效 Z轴参数，字段可空
     * 补充：空字段不传值时，系统保留当前生效配置
     */
    const val SETTINGS_GLOBAL_EQUALIZER = "Settings_Gloabal_Equalizer"
    //endregion

    //region ===================== 工具方法：AudioManager 参数读写 =====================
    /**
     * 单个设置音频参数
     * @param context 上下文
     * @param key 参数名
     * @param value 参数值
     */
    fun setAudioParam(context: Context, key: String, value: Any) {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager.setParameters("$key=$value")
    }

    /**
     * 批量设置多组音频参数
     * 拼接规则：key1=value1;key2=value2;key3=value3
     * @param context 上下文
     * @param params 键值对集合
     */
    fun setAudioParams(context: Context, params: Map<String, Any>) {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val paramStr = params.entries.joinToString(";") { "${it.key}=${it.value}" }
        audioManager.setParameters(paramStr)
    }

    /**
     * 读取单个音频参数
     * @param context 上下文
     * @param key 参数名
     * @return 参数字符串结果
     */
    fun getAudioParam(context: Context, key: String): String {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        return audioManager.getParameters(key)
    }
    //endregion

    //region ===================== 工具方法：Settings.Global 持久化配置读写 =====================
    /**
     * 写入音场模式 JSON 配置
     * @param context 上下文
     * @param jsonStr 合法 JSON 字符串
     */
    fun setSoundStageConfig(context: Context, jsonStr: String) {
        Settings.Global.putString(
            context.contentResolver,
            SETTINGS_GLOBAL_SOUND_STAGE,
            jsonStr
        )
    }

    /**
     * 读取音场模式 JSON 配置
     * @param context 上下文
     * @param defValue 默认值，为空时返回 {}
     * @return JSON 字符串
     */
    fun getSoundStageConfig(context: Context, defValue: String = "{}"): String {
        return Settings.Global.getString(
            context.contentResolver,
            SETTINGS_GLOBAL_SOUND_STAGE
        ) ?: defValue
    }

    /**
     * 写入均衡器 JSON 配置
     * @param context 上下文
     * @param jsonStr 合法 JSON 字符串
     */
    fun setEqualizerConfig(context: Context, jsonStr: String) {
        Settings.Global.putString(
            context.contentResolver,
            SETTINGS_GLOBAL_EQUALIZER,
            jsonStr
        )
    }

    /**
     * 读取均衡器 JSON 配置
     * @param context 上下文
     * @param defValue 默认值，为空时返回 {}
     * @return JSON 字符串
     */
    fun getEqualizerConfig(context: Context, defValue: String = "{}"): String {
        return Settings.Global.getString(
            context.contentResolver,
            SETTINGS_GLOBAL_EQUALIZER
        ) ?: defValue
    }
    //endregion
}
