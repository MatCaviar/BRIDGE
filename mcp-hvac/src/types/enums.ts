// Source: src/types/climate.ts
export const TempUnit = {
  celsius: "celsius",
  fahrenheit: "fahrenheit"
} as const;
export type TempUnit = (typeof TempUnit)[keyof typeof TempUnit];

// Source: src/types/climate.ts
export const FanZone = {
  front: "front",
  rear: "rear",
  all: "all"
} as const;
export type FanZone = (typeof FanZone)[keyof typeof FanZone];

// Source: src/types/climate.ts
export const DefrostIntensity = {
  low: "low",
  medium: "medium",
  high: "high"
} as const;
export type DefrostIntensity = (typeof DefrostIntensity)[keyof typeof DefrostIntensity];

// Source: src/types/window.ts
export const WindowPosition = {
  driver: "driver",
  passenger: "passenger",
  rear_left: "rear_left",
  rear_right: "rear_right"
} as const;
export type WindowPosition = (typeof WindowPosition)[keyof typeof WindowPosition];

// Source: src/types/seat.ts
export const SeatPosition = {
  driver: "driver",
  passenger: "passenger"
} as const;
export type SeatPosition = (typeof SeatPosition)[keyof typeof SeatPosition];
