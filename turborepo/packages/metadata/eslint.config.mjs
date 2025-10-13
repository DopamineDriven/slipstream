import baseConfig from "@slipstream/eslint-config/base";

/** @type {import('typescript-eslint').Config} */
export default [
  ...baseConfig,
  {
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/prefer-includes": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/prefer-regexp-exec": "off",
      "prefer-const": "off",
      "no-useless-escape": "off"
    },
    ignores: ["dist/**"]
  }
];
