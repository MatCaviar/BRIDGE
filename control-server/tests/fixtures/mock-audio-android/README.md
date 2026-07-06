# Mock Audio Android

This deliberately small source project exercises BRIDGE's source-first pipeline.
It exposes three callable audio operations through a manager, AIDL contract, and
RPC proxy. The transport throws because generated MCP mock mode must not contact
real vehicle hardware.

Expected candidates: `get_audio_volume`, `set_audio_volume`, `set_audio_mute`.
No capability may be inferred from the reference schema example.
