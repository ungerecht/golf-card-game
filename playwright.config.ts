import { defineConfig } from "@playwright/test";

const CLIENT_PORT = 5173;
const SERVER_PORT = 2567;

export default defineConfig({
  testDir: "./e2e",
  // A whole game is played, so give it room.
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  webServer: [
    {
      command: "pnpm --filter @golf/server dev",
      port: SERVER_PORT,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "pnpm --filter @golf/client dev --port 5173 --strictPort",
      url: `http://localhost:${CLIENT_PORT}`,
      reuseExistingServer: !process.env.CI,
    },
  ],
  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    trace: "retain-on-failure",
    // Lets a machine with its own Chromium skip `playwright install`.
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM_PATH,
    },
  },
});
