import type { CapacitorConfig } from "@capacitor/cli";

/** The phone apps (Android and iPhone): the same site, built into dist/ and packed with the app. */
const config: CapacitorConfig = {
  appId: "com.artch43.organizer",
  appName: "Organizer",
  webDir: "dist",
  plugins: {
    SplashScreen: { launchAutoHide: true, launchShowDuration: 600, backgroundColor: "#1A1B1E", showSpinner: false },
  },
};

export default config;
