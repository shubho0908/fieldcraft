# Fieldcraft

Fieldcraft is a local-first Chrome MV3 extension that reads a job/application page, evaluates it against a saved candidate profile, researches the company, drafts concise evidence-backed answers, and fills only the fields the user selects. It never submits an application.

## What it does

- Keeps a structured candidate profile, full resume text, proof points, work-authorization defaults, compensation/notice-period facts, canonical answers, and an optional resume attachment in Chrome extension storage.
- Extracts visible JD content and up to 100 application controls from Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Jobvite, iCIMS, BambooHR, Wellfound, LinkedIn, and generic forms.
- Uses the OpenAI Responses API with structured output, tiered GPT-5.5/5.6 models, and optional live web search.
- Produces an honest fit score, hard blockers, company brief with clickable sources, missing-fact list, and one reviewed suggestion per detected field.
- Handles textareas, native selects, radio groups, checkboxes, contenteditable controls, and resume file inputs.
- Requires field-level review. Sensitive or unsupported facts are never guessed, and the extension never presses Submit.

## Install the ready build

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the `apps/extension/dist` directory.
5. Pin Fieldcraft, open a job page, and click its toolbar icon.

Chrome may ask for access to pages you visit. Fieldcraft needs this to read visible job forms and insert only the answers you approve. It does not analyze a page until you press **Analyze this job**.

## First setup

1. Add identity and public work links.
2. Paste the full text version of the resume. This is the source-of-truth boundary for candidate claims.
3. Optionally attach the actual resume file for file-upload fields.
4. Add explicit work authorization, sponsorship, notice period, compensation, relocation, and reusable answers. Blank means “ask me during review.”
5. Add an OpenAI API key and choose the quality/cost tier.

By default, the API key is held in `chrome.storage.session` and disappears when the browser session ends. “Remember API key” stores it in Chrome local extension storage instead.

## Develop

This project is a [Bun](https://bun.sh/) + [Turborepo](https://turbo.build/) monorepo. Run:

```bash
bun install
bun run dev
```

This starts all apps in parallel. To start a single app:

```bash
bun run dev --filter=fieldcraft-extension
bun run dev --filter=fieldcraft-web
```

Load the development output shown by CRXJS in `chrome://extensions`. For a production bundle:

```bash
bun run check
bun run test
bun run eval
OPENAI_API_KEY=sk-... bun run eval:live
bun run build
```

- `bun run eval` — deterministic judges (no network)
- `bun run eval:live` — optional live OpenAI Responses run of the fixture pack (skipped without `OPENAI_API_KEY`)

Live eval options (env):

| Env | Default | Description |
|-----|---------|-------------|
| `FIELDCRAFT_EVAL_MODEL` | catalog default (`DEFAULT_EVAL_MODEL_ID`) | Any id from the model catalog |
| `FIELDCRAFT_EVAL_REASONING` | catalog default (`DEFAULT_EVAL_REASONING_EFFORT`) | `none` \| `low` \| `medium` \| `high` \| `xhigh` \| `max` \| `auto` |
| `FIELDCRAFT_EVAL_RESEARCH` | off | Set to `1` to enable company web research |

```bash
OPENAI_API_KEY=sk-... bun run eval:live
OPENAI_API_KEY=sk-... FIELDCRAFT_EVAL_MODEL=<catalog-id> bun run eval:live
OPENAI_API_KEY=sk-... FIELDCRAFT_EVAL_REASONING=high bun run eval:live
```

Defaults live in `apps/extension/src/lib/models.ts` only — runtime never hardcodes model or reasoning strings.

## Workspace layout

- `apps/extension/` — the Chrome MV3 extension.
- `apps/web/` — the public website (Vite + React placeholder).

## Architecture

- `apps/extension/src/content.ts` reads the active page and applies reviewed values.
- `apps/extension/src/background.ts` owns API calls and the tab-scoped analysis sessions, so the API key never enters page code and switching tabs never shows or redirects another tab's work.
- `apps/extension/src/lib/chrome-events.ts` and `apps/extension/src/lib/chrome-tabs.ts` provide small Chrome extension event/active-tab helpers.
- `apps/extension/src/lib/page.ts` performs generic ATS/form extraction and browser-compatible filling.
- `apps/extension/src/lib/prompt.ts` defines the truthfulness, prompt-injection, writing, and field-action contract.
- `apps/extension/src/lib/enums.ts` is the single source of truth for domain values (fit verdicts, actions, confidence, reasoning effort, model IDs, judge IDs).
- `apps/extension/src/lib/models.ts` defines the OpenAI model catalog and per-tier defaults on top of those enums.
- `apps/extension/src/lib/fit.ts` enforces fit-score invariants after model output.
- `apps/extension/src/lib/openai.ts` calls the Responses API with structured outputs, configured web search, response storage disabled, and a privacy-preserving installation identifier.
- `apps/extension/src/lib/eval/` holds fixtures, deterministic judges, and golden samples for analysis quality gates.
- `apps/extension/src/lib/tab-sessions.ts` guards session identity and run matching for background/sidepanel state.
- `apps/extension/src/lib/dashboard-review.ts` builds review drafts and the default auto-selection of safe fills.
- `apps/extension/src/components/` contains the sidepanel UI, split into `Dashboard.tsx`, `DashboardViews.tsx`, `ProfileEditor.tsx`, `ProfileEditorForm.tsx`, and the `useDashboardBinding` hook.
- `turbo.json` orchestrates `build`, `dev`, `test`, `check`, `eval`, and `eval:live` across workspaces.

## Deliberate safety boundaries

- No invented candidate facts.
- No automatic submission.
- No filling of a field marked `skip`.
- Sensitive demographic fields require explicit profile context and are still forced through review.
- Existing form values are preserved by the model contract.
- Job pages and search results are treated as untrusted data, not model instructions.
- Resume attachment bytes are not sent as model context; only the filename and presence flag are sent. The file remains available locally for an approved upload field.

## Practical limitations

- Chrome blocks content scripts on internal pages and the Chrome Web Store.
- A few custom JavaScript comboboxes require clicking the displayed option after text is inserted.
- Cross-origin forms embedded inside inaccessible iframes cannot be read from the top page.
- Live API behavior requires a valid OpenAI API key with access to the selected model and web search.
- The extension is intentionally not a mass-apply bot. Review and submission stay with the user.
