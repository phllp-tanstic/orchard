// @ts-check
import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

export default [
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "reports/**",
      "evidence/raw/**",
      // One-off investigation/assessment scripts. Never committed (.gitignore),
      // so CI never sees them; ignoring them here keeps `eslint .` consistent
      // with that policy instead of failing on files that cannot be pushed.
      "scripts/scratch/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: false,
        sourceType: "module",
        ecmaVersion: 2022,
      },
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // TypeScript's compiler (via `pnpm typecheck`) already catches unresolved
      // identifiers/types; no-undef has false positives on global TS lib types
      // (e.g. RequestInit) that ESLint's flat-config globals list doesn't cover.
      "no-undef": "off",
    },
  },
  eslintConfigPrettier,
];
