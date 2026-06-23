// Source: ts/interface/SoundStage.ts
export const SoundStage = {
  AllCar: 0,
  Driver: 1,
  RearSeatVip: 2,
  HignOrderSurround: 3,
  MiniConcert: 4,
  ConcertHall: 5,
  ProfessionalListeningRoom: 6,
  Custom: 7,
  PanoramicCinema: 8,
  AIRhineVoice: 9,
  AIAuroraWarm: 10,
  AIEnglandStyle: 11,
  AIAmericanMetal: 12
} as const;
export type SoundStage = (typeof SoundStage)[keyof typeof SoundStage];

// Source: ts/interface/SoundStage.ts
export const SpeedVolumeStatus = {
  OFF: "OFF",
  LOW: "LOW",
  MID: "MID",
  HIGH: "HIGH"
} as const;
export type SpeedVolumeStatus = (typeof SpeedVolumeStatus)[keyof typeof SpeedVolumeStatus];

// Source: ts/interface/Equalizer.ts
export const EqualizerOfficialType = {
  0: "0",
  1: "1",
  2: "2",
  3: "3"
} as const;
export type EqualizerOfficialType = (typeof EqualizerOfficialType)[keyof typeof EqualizerOfficialType];

// Source: ts/interface/LockSound.ts
export const LockSoundType = {
  OFFICAL: 0,
  CUSTOMIZE: 1,
  OPERATION: 2
} as const;
export type LockSoundType = (typeof LockSoundType)[keyof typeof LockSoundType];

// Source: ts/proxy/MAFProxy.ts
export const FastAudioModeEnum = {
  Normal: 0,
  RecordingStudio: 1,
  KSongRoom: 2
} as const;
export type FastAudioModeEnum = (typeof FastAudioModeEnum)[keyof typeof FastAudioModeEnum];
