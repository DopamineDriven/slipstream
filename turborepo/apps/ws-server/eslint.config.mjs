import baseConfig from "@slipstream/eslint-config/base";

/** @type {import('typescript-eslint').Config} */
export default [
  ...baseConfig,
  {
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/prefer-includes": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "prefer-const": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/prefer-regexp-exec": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-namespace": "off"
    },
    ignores: ["dist/**"]
  }
];
