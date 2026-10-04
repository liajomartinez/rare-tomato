import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  // docs/private holds owner-only notes (never committed); it is not linted.
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "docs/private/**"] },
];

export default eslintConfig;
