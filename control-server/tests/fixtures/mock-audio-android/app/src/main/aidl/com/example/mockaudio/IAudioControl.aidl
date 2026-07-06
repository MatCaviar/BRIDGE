package com.example.mockaudio;

/** Small source contract used only by the BRIDGE Workbench fixture. */
interface IAudioControl {
    int getAudioVolume(String zone);
    boolean setAudioVolume(String zone, int level);
    boolean setAudioMute(String zone, boolean muted);
}
