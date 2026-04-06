import type { Config } from "typescript-eslint";
import baseConfig from "@slipstream/eslint-config/base";

export default [
  ...baseConfig,
  {
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/prefer-includes": "off",
      "@typescript-eslint/require-await": "off",
      "prefer-const": "off",
      "@typescript-eslint/no-duplicate-type-constituents": "off",
      "@typescript-eslint/no-empty-object-type": "off"
    },
    ignores: ["dist/**"]
  }
] satisfies Config;
