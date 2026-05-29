import { defineConfig } from "eslint/config";
import { baseConfig } from "@slipstream/eslint-config/base";

export default defineConfig(
  {
    ignores: ["dist/**"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/prefer-includes": "off",
      "@typescript-eslint/require-await": "off",
      "prefer-const": "off"
    }
  },
  baseConfig
);
