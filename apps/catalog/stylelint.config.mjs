export default {
  rules: {
    "color-no-invalid-hex": true,
    "block-no-empty": true,
    "property-no-unknown": true,
    "declaration-property-value-disallowed-list": {
      "/color|background|border|shadow|fill|stroke/": [
        "/#[0-9a-fA-F]{3,8}\\b/",
      ],
    },
  },
};
