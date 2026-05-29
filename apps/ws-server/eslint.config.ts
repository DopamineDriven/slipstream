import { defineConfig } from "eslint/config";
import { baseConfig } from "@slipstream/eslint-config/base";

export default defineConfig(
  {
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/prefer-includes": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "prefer-const": "off",
      "no-loss-of-precision": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/prefer-regexp-exec": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-namespace": "off",
      "preserve-caught-error": "off"
    },
    ignores: ["dist/**"]
  },
  baseConfig
);
