import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vikaas.omnia',
  appName: 'Omni Media Agent',
  webDir: 'www',
  android: {
    allowMixedContent: true, // local http servers (LAN VPS/Colab) iframe support
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
