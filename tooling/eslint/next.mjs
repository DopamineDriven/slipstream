import nextPlugin from "@next/eslint-plugin-next";

/** @type {Awaited<import('typescript-eslint').Config>} */
export default [
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "@next/next": nextPlugin
    },
    rules: {
      ...nextPlugin.rules,
      // TypeError: context.getAncestors is not a function
      "@next/next/no-duplicate-head": "off",
      "import/no-default-export": "off"
    }
  }
];
