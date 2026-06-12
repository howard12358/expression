import { defineConfig } from '@playwright/test'

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30000,
    use: {
        baseURL: 'http://127.0.0.1:4173',
        browserName: 'chromium',
        channel: 'chrome'
    },
    webServer: {
        command: 'pnpm build && pnpm exec vitepress preview --host 127.0.0.1 --port 4173',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
        stdout: 'ignore',
        stderr: 'pipe'
    }
})
