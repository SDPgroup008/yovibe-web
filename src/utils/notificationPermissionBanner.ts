export type NotificationPermissionBannerMode =
  | "request"
  | "install-guidance"
  | "settings-guidance"
  | "unsupported-guidance"
  | null;

type NotificationPermissionBannerInput = {
  notificationsEnabled: boolean;
  permission: "default" | "granted" | "denied" | "unsupported";
  pushSupported: boolean;
  pushReason: "supported" | "ios-home-screen-required" | "unsupported";
};

export function resolveNotificationPermissionBannerMode({
  notificationsEnabled,
  permission,
  pushSupported,
  pushReason,
}: NotificationPermissionBannerInput): NotificationPermissionBannerMode {
  if (!notificationsEnabled || permission === "granted") return null;
  if (permission === "denied") return "settings-guidance";
  if (pushSupported) return "request";
  if (pushReason === "ios-home-screen-required") return "install-guidance";
  return "unsupported-guidance";
}
