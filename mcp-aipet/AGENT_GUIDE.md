# Agent Guide: Implementing YunOS Adapter for aipet

## Goal
Implement `src/adapters/yunos-adapter.ts` to replace the mock adapter with real YunOS SDK calls.

## Methods to Implement

| Method | Action | Object | Params | Return Type | Safety | SDK Calls |
|--------|--------|--------|--------|-------------|--------|-----------|
| navigatetopage | navigate_to | page | pageName: string | NavigationResult | normal | yunos/appmodel/StackRouter |
| gobackpage | go_back | page | none | NavigationResult | normal | yunos/appmodel/StackRouter |
| getcurrentpage | get_current | page | none | CurrentPageResult | readonly | yunos/appmodel/StackRouter |
| capturepet | capture | pet | fps: number | CaptureResult | p_gear_required | IMCameraProxy.executeCmd |
| uploadpetimage | upload | pet_image | imagePath: string | UploadResult | p_gear_required | yunos/net/HttpClient |
| generatepetavatar | generate | pet_avatar | style: string, imagePath: string | GenerateResult | p_gear_required | yunos/net/HttpClient |
| applypetavatar | apply | pet_avatar | avatarUrl: string, scene: string, confirmed: boolean | ApplyResult | p_gear_and_confirm | @banma/hdt-types |
| regeneratepetavatar | regenerate | pet_avatar | style: string | GenerateResult | p_gear_required | yunos/net/HttpClient |
| getinfovehicle | get_info | vehicle | none | VehicleInfoResult | readonly | sysprop/sysprop |
| readstatusgear | read_status | gear | none | GearStatus | readonly | yunos/platform/auto/carservice/CarPropertyManager |
| subscribegear | subscribe | gear | none | GearChangeResult | readonly | yunos/platform/auto/carservice/CarPropertyManager |
| getinfohotspot | get_info | hotspot | none | HotspotInfoResult | readonly | yunos/net/HotspotManager |
| generateqrcode | generate | qr_code | data: string | QrCodeResult | readonly | yunos/net/HttpClient |
| transferphone | transfer | phone | data: string, ssid: string | TransferResult | p_gear_and_network | yunos/net/HotspotManager, yunos/net/HttpClient |
| getstatusapp | get_status | app | none | AppStatusResult | readonly | extend/hdt/page/BMPage |
| getinfodisplay | get_info | display | none | DisplayInfoResult | readonly | extend/hdt/page/BMPage |
| showtoast | show | toast | message: string, align: string? | ToastResult | normal | yunos/ui/widget/Toast |
| showloading | show | loading | message: string? | LoadingResult | normal | yunos/ui/animation/PropertyAnimation |
| hideloading | hide | loading | none | LoadingResult | normal | yunos/ui/animation/PropertyAnimation |
| playanimation | play | animation | _type: string, duration: number? | AnimationResult | normal | yunos/ui/view/ImageView |

## SDK Paths

- `yunos/appmodel/StackRouter`
- `IMCameraProxy.executeCmd`
- `yunos/net/HttpClient`
- `@banma/hdt-types`
- `sysprop/sysprop`
- `yunos/platform/auto/carservice/CarPropertyManager`
- `yunos/net/HotspotManager`
- `extend/hdt/page/BMPage`
- `yunos/ui/widget/Toast`
- `yunos/ui/animation/PropertyAnimation`
- `yunos/ui/view/ImageView`

## Safety Requirements

### P-Gear Required
These methods require the vehicle to be in Park gear:
- `capture_photo`
- `upload_pet_image`
- `generate_pet_avatar`
- `regenerate_pet_avatar`

### P-Gear + User Confirmation
These methods require P-gear AND explicit user confirmation:
- `apply_pet_avatar`

### P-Gear + Network
These methods require P-gear AND active network connection:
- `transfer_to_phone`

## Implementation Notes

1. Start by copying `src/adapters/mock-adapter.ts` as a template
2. Replace each mock implementation with the actual YunOS SDK call
3. Update `src/adapters/index.ts` to import and use the YunOS adapter when `mock_mode: false`
4. Run `npx vitest run` after each method implementation to verify
5. Ensure all return values match the DTO types defined in `src/adapters/types.ts`
