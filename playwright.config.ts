import { defineConfig, devices } from '@playwright/test';

// Real Chrome (channel) + WebGPU flags → e2e exercises the actual WebGPU render
// path, not headless-shell (which has no GPU). Lets tests assert the arena
// initializes, not just the unsupported fallback.
export default defineConfig({
  testDir: './e2e',
  // Serialize: each spec drives a real headed WebGPU window and asserts on
  // wall-clock sim progression (RAF-paced). Chrome throttles requestAnimationFrame
  // in BACKGROUNDED windows, so running specs in parallel starves the sim of the
  // backgrounded ones and time-based assertions (player moved, enemies spawned)
  // flake. One worker keeps the window focused and the sim real-time.
  fullyParallel: false,
  workers: 1,
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
