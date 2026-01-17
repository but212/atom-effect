// vite.config.ts
import { defineConfig } from "vitest/config";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "AtomEffectJQuery",
      formats: ["es", "cjs", "umd"],
      fileName: (format) =>
        format === "umd"
          ? "atom-effect-jquery.min.js"
          : `index.${format === "es" ? "mjs" : "cjs"}`,
    },
    rollupOptions: {
      // jQuery is external, but atom-effect is bundled
      external: ["jquery"],
      output: {
        globals: {
          jquery: "jQuery",
        },
        exports: "named",
      },
    },
    sourcemap: true,
  },
  plugins: [dts({ rollupTypes: true })],
  test: {
    environment: "jsdom",
    setupFiles: ["./__tests__/setup.ts"],
  },
});
