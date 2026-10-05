/**
 * Lint rules for the shared packages and the browser extension.
 *
 * `apps/web` keeps its own config (Next's rules on top of these); each package
 * runs `eslint .` from its own folder and lands here. The rule set mirrors the
 * web app's — typescript-eslint plus the React hooks rules — so code reads the
 * same wherever it lives.
 */
import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default defineConfig([
  globalIgnores(["**/node_modules/**", "**/dist/**", "**/.next/**", "apps/web/**"]),

  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,

  {
    rules: {
      // A leading underscore marks a parameter or rest sibling that is there on
      // purpose: a signature kept stable, or a key stripped from an object.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      // Written for the React Compiler, which nothing here uses. TipTap and
      // CodeMirror are configured once with callbacks like `() => ref.current`
      // that read the ref later, from editor events — the rule cannot tell
      // that from a read during render, and nearly every hit was one.
      "react-hooks/refs": "off",
    },
  },

  // The extension is plain JavaScript run by the browser, not bundled.
  {
    files: ["apps/extension/**/*.js"],
    ...js.configs.recommended,
    languageOptions: {
      // `chrome` is declared per file, with a `/* global chrome */` comment.
      globals: globals.browser,
    },
  },
]);
