# Agent Guide: Implementing YunOS Adapter for imaudio

## Goal
Implement `src/adapters/yunos-adapter.ts` to replace the mock adapter with real YunOS SDK calls.

## Methods to Implement

| Method | Action | Object | Params | Return Type | Safety | SDK Calls |
|--------|--------|--------|--------|-------------|--------|-----------|
| readsoundstage | read | sound_stage | none | SoundStageResult | readonly | SoundStageManager.getSoundStage |
| setsoundstage | set | sound_stage | mode: number, fade: number?, balance: number? | SoundStageResult | normal | SoundStageManager.setSoundStage |
| readvncstatus | read | vnc_status | none | VncStatusResult | readonly | SoundStageManager.getSpeedVolumeStatus |
| setvncstatus | set | vnc_status | enabled: boolean | VncStatusResult | normal | SoundStageManager.setSpeedVolumeStatus |
| readequalizer | read | equalizer | none | EqualizerResult | readonly | EqualizerModel.getEffectValues |
| setequalizerpreset | set | equalizer_preset | preset: string | EqualizerResult | normal | EqualizerModel.sendEffectValues |
| setcustomequalizer | set | custom_equalizer | effectId: string, values: string | EqualizerResult | normal | EqualizerModel.sendEffectValues |
| savecustomequalizer | save | custom_equalizer | name: string, values: string | EqualizerSaveResult | normal | EqualizerModel.createAndSaveEffect |
| readbeosonic | read | beosonic | none | BeosonicResult | readonly | BeosonicModel.getCurrentValues |
| setbeosonicpreset | set | beosonic_preset | x: number, y: number, z: number? | BeosonicResult | normal | BeosonicModel.sendEffectValues |
| readlocksound | read | lock_sound | none | LockSoundResult | readonly | LockSoundModel.getEffectValues |
| enablelocksound | enable | lock_sound | resourceCode: string | LockSoundResult | normal | LockSoundModel.sendEffectValues |
| disablelocksound | disable | lock_sound | none | LockSoundResult | normal | LockSoundModel.disableLockSound |
| readkaraoke | read | karaoke | none | KaraokeResult | readonly | KaraokeModel.getFastAudioMode |
| setkaraokemode | set | karaoke_mode | mode: number | KaraokeResult | normal | KaraokeManager.setFastAudioMode |
| readcarinfo | read | car_info | none | CarInfoResult | readonly | CarInfoModel.getVin |
| readappstatus | read | app_status | none | AppStatusResult | readonly | WindowManager.isPageActive |

## SDK Paths

- `SoundStageManager.getSoundStage`
- `SoundStageManager.setSoundStage`
- `SoundStageManager.getSpeedVolumeStatus`
- `SoundStageManager.setSpeedVolumeStatus`
- `EqualizerModel.getEffectValues`
- `EqualizerModel.sendEffectValues`
- `EqualizerModel.createAndSaveEffect`
- `BeosonicModel.getCurrentValues`
- `BeosonicModel.sendEffectValues`
- `LockSoundModel.getEffectValues`
- `LockSoundModel.sendEffectValues`
- `LockSoundModel.disableLockSound`
- `KaraokeModel.getFastAudioMode`
- `KaraokeManager.setFastAudioMode`
- `CarInfoModel.getVin`
- `WindowManager.isPageActive`

## Safety Requirements

## Implementation Notes

1. Start by copying `src/adapters/mock-adapter.ts` as a template
2. Replace each mock implementation with the actual YunOS SDK call
3. Update `src/adapters/index.ts` to import and use the YunOS adapter when `mock_mode: false`
4. Run `npx vitest run` after each method implementation to verify
5. Ensure all return values match the DTO types defined in `src/adapters/types.ts`
