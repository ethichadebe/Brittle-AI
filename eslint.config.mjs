// Flat config covering all three workspaces from the repo root, matching the
// monorepo's single-lockfile layout.
//
// The rule sets are chosen to match what the code already assumed: there were
// `@typescript-eslint/no-explicit-any` and `react-hooks/exhaustive-deps`
// disable comments in the source before any linter was installed. Those
// comments now do something.

import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    // Generated or produced, never hand-edited.
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "frontend/src/routeTree.gen.ts",
      ".claude/skills/**",
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommended,

  // Backend and shared types: Node.
  {
    files: ["backend/**/*.ts", "packages/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Frontend: browser, plus the rules of hooks.
  {
    files: ["frontend/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },

  // Config files run in Node regardless of which workspace they sit in.
  {
    files: ["**/*.config.{ts,js}", "eslint.config.mjs"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Probes and one-off tools under scripts/ run in Node. Declaring that is not
  // the same as silencing no-undef: a real typo is still an error, which is the
  // whole point of listing the environment rather than turning the rule off.
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Tests may lean on loose typing for fixtures.
  {
    files: ["**/*.test.ts", "**/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
