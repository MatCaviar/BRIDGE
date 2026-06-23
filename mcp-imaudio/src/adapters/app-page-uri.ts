/**
 * Maps appName to its system page:// URI for sendlink navigation.
 * Derived from imaudio_app_code PageLink usage. System-level (adb sendlink),
 * does NOT go through app D-Bus (which is permission-blocked).
 */
export const APP_PAGE_URI: Readonly<Record<string, string>> = {
  imaudio: "page://imaudio.yunos.com/imaudio",
  lightpoint: "page://lightpoint.yunos.com/ShowRoomPage",
  smartcar: "page://smartcar.ivi.com/smartcar",
};

export function resolvePageUri(appName: string): string | undefined {
  return APP_PAGE_URI[appName];
}
