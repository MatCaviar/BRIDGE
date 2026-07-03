package com.example.mockaudio

/** Explicit wire names make every MCP candidate traceable to source. */
class AudioRpcProxy {
    fun getAudioVolume(zone: String): Int =
        transact("get_audio_volume", mapOf("zone" to zone)) as Int

    fun setAudioVolume(zone: String, level: Int): Boolean =
        transact("set_audio_volume", mapOf("zone" to zone, "level" to level)) as Boolean

    fun setAudioMute(zone: String, muted: Boolean): Boolean =
        transact("set_audio_mute", mapOf("zone" to zone, "muted" to muted)) as Boolean

    private fun transact(operation: String, payload: Map<String, Any>): Any =
        error("Fixture transport is intentionally local-only: $operation $payload")
}
