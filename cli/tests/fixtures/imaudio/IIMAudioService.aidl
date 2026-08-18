package com.immotors.aidl;
import com.immotors.aidl.IIMAudioCallback;
/**
 * 车载音频服务对外 AIDL 接口。
 *
 * 对应原项目 `adaptor/IMAudioServiceAdapter.ts` 通过 DBus 暴露给 App 的方法集合。
 * 入参与返回值统一使用 JSON 字符串承载（对应原 DBus 的 readJSON/writeJSON），
 * 返回 JSON 形如 { code, message, methodName, data }。
 */
interface IIMAudioService {

    /** 注册事件回调。 */
    void registerCallback(IIMAudioCallback callback);

    /** 注销事件回调。 */
    void unregisterCallback(IIMAudioCallback callback);

    /** 查询音效库（本地/云端），对应 querySoundLibrary。 */
    String querySoundLibrary(String paramJson);

    /** 删除音效库，对应 deleteSoundLibrary。 */
    String deleteSoundLibrary(String paramJson);

    /** 安装音效库，对应 installSoundLibrary。 */
    String installSoundLibrary(String paramJson);

    /** 预览音效，对应 previewSound。 */
    String previewSound(String paramJson);

    /** 查询当前生效音效，对应 queryCurrentActiveSound。 */
    String queryCurrentActiveSound();

    /** 查询均衡器库，对应 queryEffectLibrary。 */
    String queryEffectLibrary(String paramJson);

    /** 新增均衡器，对应 addEffect。 */
    String addEffect(String paramJson);

    /** 更新均衡器，对应 updateEffect。 */
    String updateEffect(String paramJson);

    /** 删除均衡器，对应 deleteEffect。 */
    String deleteEffect(String paramJson);

    /** 获取均衡器分享码，对应 getEffectShareCode。 */
    String getEffectShareCode(String paramJson);

    /** 根据分享码导入均衡器，对应 addEffectByShareCode。 */
    String addEffectByShareCode(String paramJson);

    /** 保存当前生效均衡器数据，对应 saveCurrentEffectData。 */
    String saveCurrentEffectData(String paramJson);

    // ── Beosonic 均衡器 ────────────────────────────────────────

    /** 设置 Beosonic 均衡器坐标点，对应 IMAudioPolicyProvider.setBeosonicPoint。 */
    String setBeosonicPoint(String paramJson);

    // ── 音场模式 ──────────────────────────────────────────────

    /** 获取当前音场模式（mode + fade + balance），对应 AudioPolicyProxy.getSoundStage。 */
    String getSoundStage();

    /** 设置音场模式及 fade/balance 参数，对应 AudioPolicyProxy.setSoundStage。 */
    String setSoundStage(String paramJson);

    // ── 整车/头枕音量 ─────────────────────────────────────────

    /** 同步修改整车音量和头枕音区音量值，对应 AudioPolicyProxy.setCarAndHeadrestVolume。 */
    String setCarAndHeadrestVolume(String paramJson);

    /** 获取整车音量和头枕音区音量值，对应 AudioPolicyProxy.getLastVolumeData。 */
    String getLastVolumeData(String paramJson);

    // ── 麦克风音量 ────────────────────────────────────────────

    /** 设置麦克风音量，对应 AudioPolicyProxy.setMicVocal。 */
    String setMicVocal(String paramJson);

    /** 获取麦克风音量，对应 AudioPolicyProxy.getMicVocal。 */
    String getMicVocal();

    // ── K歌混响模式 ───────────────────────────────────────────

    /** 设置K歌混响模式，对应 AudioPolicyProxy.setFastAudioMode。 */
    String setFastAudioMode(String paramJson);

    /** 获取K歌混响模式，对应 AudioPolicyProxy.getFastAudioMode。 */
    String getFastAudioMode();

    // ── 随速音量补偿(VNC) ────────────────────────────────────

    /** 获取随速音量补偿状态，对应 SoundStageManager.getSpeedVolumeStatus。 */
    String getSpeedVolumeStatus();

    /** 设置随速音量补偿状态，对应 SoundStageManager.setSpeedVolumeStatus。 */
    String setSpeedVolumeStatus(String paramJson);
}
