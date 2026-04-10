import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import { defineConfig } from "eslint/config";

export default defineConfig(
  {
    ignores: [
      "node_modules/**",
      "build/**",
      "dist/**",
      "artifacts/**",
      "scripts/**",
      "postcss.config.js",
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      quotes: "off",
      indent: "off",
      "linebreak-style": 0,
      "object-curly-spacing": ["error", "always"],
      semi: "off",
      "@typescript-eslint/no-explicit-any": "off",
      "space-infix-ops": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "prettier/prettier": [
        "error",
        {
          printWidth: 80,
          bracketSpacing: true,
          singleQuote: true,
          semi: false,
          trailingComma: "es5",
          endOfLine: "auto",
        },
      ],
    },
  },
);
