import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./fixgo-user/src', import.meta.url)),
      ...Object.fromEntries(['react', 'react-test-renderer', 'react-native', 'expo-router', '@expo/vector-icons', 'react-native-safe-area-context', '@rnmapbox/maps', 'stream-chat', 'zustand'].map((name) => [
        name, fileURLToPath(new URL(`./fixgo-user/node_modules/${name}`, import.meta.url)),
      ])),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false, // các bài kiểm thử backend dùng chung một dự án Supabase
  },
});
