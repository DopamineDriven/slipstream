import type { Config } from "typescript-eslint";
import baseConfig from "@slipstream/eslint-config/base";

export default <Config>[
  {
    rules: {
      "@typescript-eslint/consistent-type-definitions": "off"
    },
    ignores: ["**node_modules**"]
  },
  ...baseConfig
];
