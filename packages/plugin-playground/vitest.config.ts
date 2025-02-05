import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    test: {
        include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        environment: 'node',
    },
    resolve: {
        alias: {
            '@elizaos/core': resolve(__dirname, '../core/src'),
        },
    },
});