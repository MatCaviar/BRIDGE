export interface AdapterControl {
  setError(method: string, error: Error | null): void;
  resetState(): void;
}
