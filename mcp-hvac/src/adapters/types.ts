// Auto-generated adapter interface — derived from analysis.json capabilities
// IAdapter is the contract between tool handlers and platform SDKs

export interface SetTemperatureResult {
  readonly success: boolean;
  readonly currentTemp: string;
  readonly targetTemp: string;
}

export interface SetFanSpeedResult {
  readonly success: boolean;
  readonly currentSpeed: string;
  readonly zone: string;
}

export interface ToggleAcResult {
  readonly success: boolean;
  readonly isActive: boolean;
}

export interface ReadCabinTemperatureResult {
  readonly success: boolean;
  readonly temperature: string;
  readonly humidity: string;
}

export interface DefrostFrontResult {
  readonly success: boolean;
  readonly intensity: string;
  readonly estimated_time: string;
}

export interface OpenWindowResult {
  readonly success: boolean;
  readonly currentPosition: string;
  readonly percentage: string;
}

export interface CloseWindowResult {
  readonly success: boolean;
  readonly currentPosition: string;
  readonly percentage: string;
}

export interface ReadAirQualityResult {
  readonly success: boolean;
  readonly pm25: string;
  readonly pm10: string;
  readonly aqi_level: string;
}

export interface SetSeatVentilationResult {
  readonly success: boolean;
  readonly currentLevel: string;
  readonly seat: string;
}

export interface IAdapter {
  readonly isMock: boolean;

  setTemperature(value: number, unit?: string): Promise<SetTemperatureResult>;
  setFanSpeed(speed: number, zone: string): Promise<SetFanSpeedResult>;
  toggleAc(enabled: boolean): Promise<ToggleAcResult>;
  readCabinTemperature(): Promise<ReadCabinTemperatureResult>;
  defrostWindshield(intensity: string): Promise<DefrostFrontResult>;
  openWindow(position: string, percentage: number): Promise<OpenWindowResult>;
  closeWindow(position: string): Promise<CloseWindowResult>;
  readAqi(): Promise<ReadAirQualityResult>;
  setVentilation(seat: string, level: number, enabled?: boolean): Promise<SetSeatVentilationResult>;
}

