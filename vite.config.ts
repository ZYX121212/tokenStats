import { defineConfig, type UserConfig } from "vite";
import solid from "vite-plugin-solid";
import { fileURLToPath, URL } from "node:url";

// Extend UserConfig locally since vitest augments it at runtime.
// The `test` block is consumed by `vitest` when it loads this config.
interface UserConfigWithTest extends UserConfig {
  test?: {
    globals?: boolean;
    environment?: string;
    [key: string]: unknown;
  };
}

export default defineConfig({
  plugins: [solid()],
  root: "src",
  publicDir: "../public",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("src/index.html", import.meta.url)),
        floating: fileURLToPath(new URL("src/floating.html", import.meta.url)),
      },
      output: {
        manualChunks: undefined,
      },
    },
    sourcemap: false,
    chunkSizeWarningLimit: 500,
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  test: {
    globals: true,
    environment: "jsdom",
  },
} as UserConfigWithTest);
