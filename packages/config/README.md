# Shared configuration

`tsconfig.base.json` contains only compiler options shared by the Vite extension and Next.js site. App entry points, runtime types, module settings, and build configuration remain app-specific.

There is deliberately no shared ESLint, Prettier, Tailwind, or UI package: the extension did not use those tools, the website uses scoped CSS, and no production component is shared across the two runtime surfaces yet.
