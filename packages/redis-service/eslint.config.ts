import type { Config } from "typescript-eslint";
import baseConfig from "@slipstream/eslint-config/base";

export default <Config>[
  ...baseConfig,
  {
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/prefer-includes": "off",
      "@typescript-eslint/require-await": "off",
      "prefer-const": "off"
    },
    ignores: ["dist/**"]
  }
];
