import baseConfig from "@slipstream/eslint-config/base";
import nextjsConfig from "@slipstream/eslint-config/next";
import reactConfig from "@slipstream/eslint-config/react";

/** @type {import('typescript-eslint').Config} */
export default [
  ...baseConfig,
  ...reactConfig,
  ...nextjsConfig,
  {
    ignores: [".next/**", "!.next/types/**/*"],
    rules: {
      "@typescript-eslint/consistent-type-assertions": "off",
      "@typescript-eslint/require-await": "off",
      "import/consistent-type-specifier-style": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/prefer-regexp-exec": "off",
      "@typescript-eslint/no-unused-vars": "warn"
    }
  }
];
