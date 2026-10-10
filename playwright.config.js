import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

// Tests need the same variables as the app (Supabase keys for fixtures).
config({ path: ".env.development.local", quiet: true });
config({ path: ".env.local", quiet: true });

// End-to-end tests run against the real local stack: Next.js dev server, the local
// Supabase (Auth, Postgres, Mailpit), shared Redis and the configured R2 bucket.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
