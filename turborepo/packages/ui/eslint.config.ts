import type { Config } from "typescript-eslint";
import baseConfig from "@t3-chat-clone/eslint-config/base";
import reactConfig from "@t3-chat-clone/eslint-config/react";

export default [
  ...baseConfig,
  ...reactConfig,
  {
    ignores: ["dist/**"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/prefer-includes": "off",
      "@typescript-eslint/prefer-string-starts-ends-with": "off",
      "@typescript-eslint/require-await": "off",
      "prefer-const": "off"
    }
  }
] satisfies Config;