// imaudio Compose app (com.immotors.imaudio) callback contract — verbatim copy of
// imaudio_service_client/com/immotors/aidl/IIMAudioCallback.aidl, hosted under
// com.immotors.imaudio (see IIMAudioService.aidl header note for why).
package com.immotors.imaudio;

interface IIMAudioCallback {

    /**
     * 音效下载/安装状态变化。
     * 对应原 soundStatusChangeSignal。
     */
    void onSoundStatusChange(int soundStatus, String resourceCode, String lastSlot);

    /**
     * 预览播放状态变化。
     * 对应原 previewSoundStatusSignal。
     * @param previewSoundStatusJson PreviewSoundStatus 的 JSON。
     */
    void onPreviewSoundStatus(String previewSoundStatusJson);

    /**
     * 本地音效库更新。
     * 对应原 updateLocalSoundLibrary。
     */
    void onLocalSoundLibraryUpdate(boolean dataChange);

    /**
     * 均衡器库变化。
     * 对应原 effectLibraryChangeSignal。
     * @param effectSignalJson EffectSignalData 的 JSON。
     */
    void onEffectLibraryChange(String effectSignalJson);

    /**
     * 音场模式变更通知。
     * @param effectModeJson EffectModeAndFB 的 JSON，形如 {"mode":9,"fade":0,"balance":0}
     */
    void onEffectModeUpdate(String effectModeJson);

    /**
     * K歌混响模式变更通知。
     * @param mode 混响模式值，对应 FastAudioMode 枚举（0=NORMAL, 1=RECORDING_STUDIO, 2=KSONG_ROOM）
     */
    void onFastAudioModeChange(int mode);

    /**
     * 麦克风音量变更通知。
     * @param vol 麦克风音量值
     */
    void onMicVolUpdate(int vol);
}
