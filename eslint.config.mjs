import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  // Private owner notes are never committed and are not linted.
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "docs/private/**", "design-source/**"] },
];

export default eslintConfig;
