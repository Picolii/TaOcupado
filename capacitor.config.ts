import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.picolii.taocupado",
  appName: "Ta Ocupado",
  webDir: ".output/public",
  server: {
    url: "https://taocupado.taocupado.workers.dev",
    cleartext: false,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_taocupado",
      iconColor: "#22c55e",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
