import { defineConfig, devices } from '@playwright/test';

// Real Chrome (channel) + WebGPU flags → e2e exercises the actual WebGPU render
// path, not headless-shell (which has no GPU). Lets tests assert the arena
// initializes, not just the unsupported fallback.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'chrome',
    launchOptions: {
      args: [
        '--enable-unsafe-webgpu',
        '--enable-features=Vulkan',
        '--use-angle=default',
        '--ignore-gpu-blocklist',
      ],
    },
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'chrome-webgpu', use: { ...devices['Desktop Chrome'] } }],
});
