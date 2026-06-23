import type { IAdapter, SetTemperatureResult, SetFanSpeedResult, ToggleAcResult, ReadCabinTemperatureResult, DefrostFrontResult, OpenWindowResult, CloseWindowResult, ReadAirQualityResult, SetSeatVentilationResult } from "./types.js";

/**
 * YunOS adapter for hvac
 * Replace each throw with actual YunOS SDK calls.
 */
export function createYunosAdapter(): IAdapter {
  return {
    isMock: false,

    /** SDK: @system.hvac | Source: src/services/climate.ts:setTemperature */
    async setTemperature(value: number, unit?: string): Promise<SetTemperatureResult> {
      throw new Error("setTemperature not implemented");
    },

    /** SDK: @system.hvac | Source: src/services/climate.ts:setFanSpeed */
    async setFanSpeed(speed: number, zone: string): Promise<SetFanSpeedResult> {
      throw new Error("setFanSpeed not implemented");
    },

    /** SDK: @system.hvac | Source: src/services/climate.ts:toggleAc */
    async toggleAc(enabled: boolean): Promise<ToggleAcResult> {
      throw new Error("toggleAc not implemented");
    },

    /** SDK: @system.sensor | Source: src/services/sensor.ts:readCabinTemp */
    async readCabinTemperature(): Promise<ReadCabinTemperatureResult> {
      throw new Error("readCabinTemperature not implemented");
    },

    /** SDK: @system.hvac | Source: src/services/climate.ts:defrostFront */
    async defrostWindshield(intensity: string): Promise<DefrostFrontResult> {
      throw new Error("defrostWindshield not implemented");
    },

    /** SDK: @system.window | Source: src/services/window.ts:openWindow */
    async openWindow(position: string, percentage: number): Promise<OpenWindowResult> {
      throw new Error("openWindow not implemented");
    },

    /** SDK: @system.window | Source: src/services/window.ts:closeWindow */
    async closeWindow(position: string): Promise<CloseWindowResult> {
      throw new Error("closeWindow not implemented");
    },

    /** SDK: @system.sensor | Source: src/services/sensor.ts:readAqi */
    async readAqi(): Promise<ReadAirQualityResult> {
      throw new Error("readAqi not implemented");
    },

    /** SDK: @system.seat | Source: src/services/seat.ts:setVentilation */
    async setVentilation(seat: string, level: number, enabled?: boolean): Promise<SetSeatVentilationResult> {
      throw new Error("setVentilation not implemented");
    },
  };
}

