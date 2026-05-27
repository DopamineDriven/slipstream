import { join, relative, resolve } from "node:path";
import { includeIgnoreFile } from "@eslint/compat";
import eslint from "@eslint/js";
// import safeql from "@ts-safeql/eslint-plugin/config";
import importPlugin from "eslint-plugin-import-x";
import turboPlugin from "eslint-plugin-turbo";
import tseslint from "typescript-eslint";

const project = resolve(relative(process.cwd(), "tsconfig.json"));
/**
 *
 * @param {string} pathname
 * @returns {string}
 */
const _migrationsDir = pathname =>
  pathname
    .slice(0, pathname.lastIndexOf("turborepo/"))
    .concat("turborepo/packages/db/prisma/migrations");
    console.log(project);
export default tseslint.config(
  includeIgnoreFile(join(import.meta.dirname, "../../.gitignore")),
  {
    // Globally ignored files
    ignores: [
      "**/*.config.*",
      "**/public/**",
      ".vscode/**/*.json",
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/cache/**"
    ]
  },
  {
    files: ["**/*.js", "**/*.mjs", "**/*.ts", "**/*.tsx"],
    plugins: {
      import: importPlugin,
      turbo: turboPlugin
    },
    ignores: [
      "**/*.config.*",
      "public/**/*.js",
      "**/node_modules/**",
      ".vscode/**/*.json"
    ],
    extends: [
      eslint.configs.recommended,
      // safeql.configs.connections({
      //   migrationsDir: migrationsDir(new URL(import.meta.url).pathname),
      //   targets: [
      //     { tag: "prisma.+($queryRaw|$executeRaw)", transform: "{type}[]" }
      //   ]
      // }),
      ...tseslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked
    ],
    rules: {
      "turbo/no-undeclared-env-vars": [
        "warn",
        {
          allowList: ["^ENV_[A-Z]+$"]
        }
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ],
      "@typescript-eslint/no-misused-promises": [
        2,
        { checksVoidReturn: { attributes: false } }
      ],
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-non-null-assertion": "error",
      "import/consistent-type-specifier-style": ["error", "prefer-top-level"],
      "@typescript-eslint/consistent-indexed-object-style": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/consistent-type-imports": "off",
      "no-unsafe-finally": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@next/next/no-page-custom-font": "off",
      // the following three rules are turned off due to existing errors eslint has when reading the source files
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/dot-notation": "off",
      "@typescript-eslint/no-empty-function": "off"
    }
  },
  {
    linterOptions: { reportUnusedDisableDirectives: true },
    languageOptions: { parserOptions: { project: true } }
  }
);
