import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-*/**", // verification builds (NEXT_DIST_DIR)
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The Android app: native code, plus the web files Gradle and Capacitor copy and generate (android/.gitignore).
    "android/**",
    "native-shell/**",
  ]),
]);

export default eslintConfig;
