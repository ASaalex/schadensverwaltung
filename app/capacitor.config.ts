import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.erfurt.schadensverwaltung',
  appName: 'Schadensverwaltung',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    Geolocation: {
      // requires high accuracy on iOS by default
    },
    Camera: {
      // permissions handled at runtime
    },
  },
};

export default config;
