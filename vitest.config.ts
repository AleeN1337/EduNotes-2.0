// eslint-disable-next-line @typescript-eslint/no-var-requires
const { defineConfig } = require("vitest/config");
const path = require("path");

module.exports = defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  css: {
    // Avoid loading project PostCSS/Tailwind during unit tests
    postcss: {
      plugins: [],
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/__tests__/**/*.test.ts?(x)"],
    reporters: "default",
    setupFiles: ["tests/setup.ts"],
    globals: true,
  },
});
