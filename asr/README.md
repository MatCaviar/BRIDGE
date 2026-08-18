# 本地 ASR (faster-whisper)

中文语音识别, 不依赖云/外网。端口 8765, cockpit 通过 gateway 的 /api/asr 转发到这里。

```bash
# 依赖 venv + HF 镜像(CN 网络必须):
#   HF_ENDPOINT=https://hf-mirror.com  HF_HUB_DISABLE_XET=1
python asr-whisper-server.py
# 看到 "Uvicorn running on http://127.0.0.1:8765" 即就绪
```
