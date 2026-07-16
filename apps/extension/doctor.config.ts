/**
 * Fieldcraft is a Chrome MV3 extension. Background + content scripts are real
 * entry points wired by the CRX manifest, not import-graph roots.
 *
 * Note: use a plain default export — `defineConfig` is not a stable public
 * export from the installed react-doctor package entry.
 */
export default {
  ignore: {
    files: [
      "src/background.ts",
      "src/content.ts",
      "src/lib/eval/**",
      "dist/**",
      "doctor.config.ts",
    ],
    overrides: [
      {
        files: ["src/lib/page.ts"],
        rules: ["react-doctor/async-await-in-loop"],
      },
      {
        files: ["src/components/ProfileEditorForm.tsx"],
        rules: ["react-doctor/no-giant-component"],
      },
    ],
    // Chrome addListener/removeListener is not DOM addEventListener.
    rules: ["react-doctor/effect-needs-cleanup"],
  },
  rules: {
    "react-doctor/no-giant-component": "off",
  },
  supplyChain: {
    enabled: false,
  },
};
