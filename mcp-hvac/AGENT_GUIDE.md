# Agent Guide: Implementing YunOS Adapter for hvac

## Goal
Implement `src/adapters/yunos-adapter.ts` to replace the mock adapter with real YunOS SDK calls.

## Methods to Implement

| Method | Action | Object | Params | Return Type | Safety | SDK Calls |
|--------|--------|--------|--------|-------------|--------|-----------|
| settemperature | set | temperature | value: number, unit: string? | TemperatureResult | normal | @system.hvac |
| setspeedfan | set_speed | fan | speed: number, zone: string | FanSpeedResult | normal | @system.hvac |
| toggleac | toggle | ac | enabled: boolean | AcToggleResult | normal | @system.hvac |
| readtemperaturecabin | read_temperature | cabin | none | CabinTempResult | readonly | @system.sensor |
| defrostwindshield | defrost | windshield | intensity: string | DefrostResult | p_gear_required | @system.hvac |
| openwindow | open | window | position: string, percentage: number | WindowResult | normal | @system.window |
| closewindow | close | window | position: string | WindowResult | normal | @system.window |
| readaqi | read | aqi | none | AqiResult | readonly | @system.sensor |
| setventilation | set | ventilation | seat: string, level: number, enabled: boolean? | SeatVentResult | normal | @system.seat |

## SDK Paths

- `@system.hvac`
- `@system.sensor`
- `@system.window`
- `@system.seat`

## Safety Requirements

### P-Gear Required
These methods require the vehicle to be in Park gear:
- `defrost_front`

## Implementation Notes

1. Start by copying `src/adapters/mock-adapter.ts` as a template
2. Replace each mock implementation with the actual YunOS SDK call
3. Update `src/adapters/index.ts` to import and use the YunOS adapter when `mock_mode: false`
4. Run `npx vitest run` after each method implementation to verify
5. Ensure all return values match the DTO types defined in `src/adapters/types.ts`
