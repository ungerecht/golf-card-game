import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    webServer: {
        command: 'pnpm dev'
    }
});