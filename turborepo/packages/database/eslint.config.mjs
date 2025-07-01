import baseConfig from "@t3-chat-clone/eslint-config/base";

/** @type {import('typescript-eslint').Config} */
export default [
  ...baseConfig,
  {
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/prefer-includes": "off",
      "@typescript-eslint/require-await": "off",
      "prefer-const": "off",
      "@typescript-eslint/triple-slash-reference": "off"
    },
    ignores: ["dist/**"]
  }
];
