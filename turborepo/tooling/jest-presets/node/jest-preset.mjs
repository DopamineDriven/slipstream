/**
 * Jest preset for Node + TypeScript workspaces
 * https://github.com/DopamineDriven/d0paminedriven/tree/master/packages/turbogen
 *
 * @type {import("ts-jest").JestConfigWithTsJest}
 */
export default {
  roots: ["<rootDir>"],
  testEnvironment: "node",
  transform: {
    "^.+\\.(mjs|cjs|js|jsx|ts|tsx|mts|cts)$": "ts-jest"
  },
  moduleFileExtensions: [
    "ts",
    "tsx",
    "mts",
    "cts",
    "js",
    "jsx",
    "mjs",
    "cjs",
    "json",
    "node"
  ],
  modulePathIgnorePatterns: [
    "<rootDir>/test/__fixtures__",
    "<rootDir>/node_modules",
    "<rootDir>/dist",
    "<rootDir>/artifacts",
    "<rootDir>/build",
    "<rootDir>/.story",
    "<rootDir>/.next",
    "<rootDir>/.turbo",
    "<rootDir>/.out",
    "<rootDir>/.output"
  ],
  preset: "ts-jest",
  cacheDirectory: "<rootDir>/node_modules/.cache/jest",
  globals: {
    "ts-jest": {
      tsconfig: "<rootDir>/tsconfig.json",
      diagnostics: true,
      isolatedModules: true,
      useESM: true
    }
  },
  testTimeout: 30000,
  testMatch: ["**/__tests__/**/*.[jt]s?(x)", "**/?(*.)+(spec|test).[jt]s?(x)"],
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/test/__fixtures__/",
    "/dist/",
    "/artifacts/",
    "/build/",
    "/.story/",
    "/.turbo/",
    "/.next/",
    "/.out/",
    "/.output/"
  ]
};
