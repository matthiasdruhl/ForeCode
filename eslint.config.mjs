import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "next-env.d.ts",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
  {
    files: [
      "src/app/**/*.{ts,tsx}",
      "src/components/**/*.{ts,tsx}",
      "src/server/**/*.{ts,tsx}",
      "src/lib/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/scripts/**", "**/evaluator/**", "**/experiments/**"],
              message:
                "Execution belongs to a separate developer-local process.",
            },
            {
              group: [
                "child_process",
                "node:child_process",
                "cluster",
                "node:cluster",
                "vm",
                "node:vm",
                "worker_threads",
                "node:worker_threads",
              ],
              message: "Web application code must not execute imported tasks.",
            },
          ],
        },
      ],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },
]);
