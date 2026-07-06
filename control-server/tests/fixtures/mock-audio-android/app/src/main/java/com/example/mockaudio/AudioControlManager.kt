package com.example.mockaudio

class AudioControlManager(private val proxy: AudioRpcProxy = AudioRpcProxy()) {
    fun getAudioVolume(zone: String): Int = proxy.getAudioVolume(zone)

    fun setAudioVolume(zone: String, level: Int): Boolean {
        require(level in 0..100) { "level must be between 0 and 100" }
        return proxy.setAudioVolume(zone, level)
    }

    fun setAudioMute(zone: String, muted: Boolean): Boolean = proxy.setAudioMute(zone, muted)
}
