import reactPlugin from "eslint-plugin-react";
import compilerPlugin from "eslint-plugin-react-compiler";
import hooksPlugin from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

/** @type {Awaited<import('typescript-eslint').Config>} */
export default tseslint.config([
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      react: reactPlugin,
      "react-compiler": compilerPlugin,
      "react-hooks": hooksPlugin
    },
    rules: {
      ...reactPlugin.configs["jsx-runtime"].rules,
      ...hooksPlugin.configs.flat["recommended-latest"].rules,
      ...compilerPlugin.configs.recommended.rules
    },
    languageOptions: {
      globals: {
        React: "writable"
      }
    }
  }
]);
