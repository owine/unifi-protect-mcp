import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**"],
    },
  },
});
