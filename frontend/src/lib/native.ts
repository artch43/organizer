import { Capacitor } from "@capacitor/core";

/** Running inside the Android or iPhone app (not in a browser). */
export const isNativeApp = Capacitor.isNativePlatform();

/** The public site. E-mail links (confirm the account, new password) from the apps open it. */
export const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) || "https://organizerapp.vercel.app";

/**
 * In the phone apps, the system status bar (clock, battery) follows the theme: dark icons on the
 * light theme, light icons on the dark one. Does nothing in the browser.
 */
export async function installNativeBars() {
  if (!isNativeApp) return () => {};
  const { StatusBar, Style } = await import("@capacitor/status-bar");
  const root = document.documentElement;
  const sync = () => {
    const dark = root.classList.contains("dark");
    void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
    if (Capacitor.getPlatform() === "android")
      void StatusBar.setBackgroundColor({ color: dark ? "#1A1B1E" : "#FFFFFF" }).catch(() => {});
  };
  sync();
  const watch = new MutationObserver(sync);
  watch.observe(root, { attributes: true, attributeFilter: ["class"] });
  return () => watch.disconnect();
}
