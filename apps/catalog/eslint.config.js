import tseslint from "typescript-eslint";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default tseslint.config(
  { ignores: ["dist/**", "src/components/ui/**"] },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "jsx-a11y": jsxA11y },
    rules: {
      ...jsxA11y.configs.recommended.rules,
      "no-restricted-syntax": [
        "error",
        {
          selector: 'JSXOpeningElement[name.name="input"]',
          message: "Use the shared shadcn Input or InputGroupInput.",
        },
        {
          selector: 'JSXOpeningElement[name.name="select"]',
          message: "Use the shared shadcn Select with SelectGroup.",
        },
        {
          selector: 'JSXOpeningElement[name.name="details"]',
          message:
            "Use shadcn Popover for consistent keyboard and focus behavior.",
        },
        {
          selector:
            'JSXAttribute[name.name="className"] > JSXExpressionContainer > TemplateLiteral[expressions.length>0]',
          message: "Compose conditional classes with cn().",
        },
      ],
    },
  },
  {
    files: ["src/naver-map.tsx"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
