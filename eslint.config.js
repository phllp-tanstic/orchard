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
      // Next build output and its generated types.
      "apps/web/.next/**",
      "apps/web/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: false,
        sourceType: "module",
        ecmaVersion: 2022,
        // The web app is TSX; without this every component file is a parse error.
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.node,
        ...globals.es2021,
        // Component and e2e code touches browser globals.
        ...globals.browser,
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
  {
    // Plain ES-module node scripts (build and run wrappers). These are not
    // TypeScript, so the block above does not reach them and `no-undef` has no
    // compiler behind it here - which is exactly where the rule earns its
    // keep, so it stays on and only the node globals are declared.
    files: ["**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: 2022,
      globals: { ...globals.node, ...globals.es2021 },
    },
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  eslintConfigPrettier,
];
