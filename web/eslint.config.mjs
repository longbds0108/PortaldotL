import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: ["scripts/**", ".next/**", "node_modules/**", "lib/abi.ts", "next-env.d.ts", "playwright-report/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // amount/salt/docKey must never reach the console in production (CLAUDE.md §8)
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
];

export default config;
