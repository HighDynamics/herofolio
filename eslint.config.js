import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["build/", "coverage/", "node_modules/", "public/"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    // `_`-prefixed names are deliberately unused: Express identifies error
    // handlers by their four-argument signature, and `{ id: _id, ...rest }` is
    // how a field is dropped from an object.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    files: ["server/**/*.ts", "scripts/**", "*.config.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
  {
    // The static server for the production build is a plain CommonJS script.
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
