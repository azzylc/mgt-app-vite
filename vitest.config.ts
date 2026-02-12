/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html"],
      include: ["src/lib/**/*.ts"],
      exclude: [
        "src/lib/firebase.ts",
        "src/lib/nativeAuth.ts",
        "src/lib/firebase-rest-auth.ts",
        "src/lib/deviceBinding.ts",
      ],
    },
    setupFiles: ["./src/__tests__/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
