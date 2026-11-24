import { defineConfig } from 'vitest/config';

// The city tests keep several whole cities in memory at once, which is more than Node's default heap.
export default defineConfig({ test: { execArgv: ['--max-old-space-size=8192'] } });
