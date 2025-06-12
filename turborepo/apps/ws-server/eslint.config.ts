import type { Config } from "typescript-eslint";
import baseConfig from "@t3-chat-clone/eslint-config/base";

export default [
  ...baseConfig,
  {
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/prefer-includes": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "prefer-const": "off"
    },
    ignores: ["dist/**"]
  }
] satisfies Config;
