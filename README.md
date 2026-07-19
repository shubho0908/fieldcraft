# Fieldcraft

Fieldcraft is a local-first Chrome MV3 extension that reads a job/application page, evaluates it against a saved candidate profile, researches the company, drafts concise evidence-backed answers, and fills only the fields the user selects—using either AI analysis or direct profile mapping. It never submits an application.

## What it does

- Toggle the Fieldcraft side panel with **⌥F** (macOS) or **Alt+F** (Windows/Linux). Same gesture opens and closes it. Rebind under `chrome://extensions/shortcuts` if the default conflicts.
- Keeps a structured candidate profile, full resume text, proof points, work-authorization defaults, compensation/notice-period facts, canonical answers, and an optional resume attachment in Chrome extension storage.
- Extracts visible JD content and up to 100 application controls from Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Jobvite, iCIMS, BambooHR, Wellfound, LinkedIn, and generic forms.
- Uses the Vercel AI SDK with structured output, supporting OpenAI (Responses API, GPT-5.5/5.6), Gemini, and any OpenAI-compatible custom provider (Fireworks, Together, Groq, OpenRouter, etc.) with a configurable base URL, model ID, and API key, with optional Exa company research.
- Produces an honest fit score, hard blockers, company brief with clickable sources, missing-fact list, and one reviewed suggestion per detected field.
- Handles textareas, native selects, radio groups, checkboxes, contenteditable controls, and resume file inputs.
- Supports two autofill modes: **Analyze with AI** (research, fit score, drafted answers) and **Direct-fill** (instant profile-to-form mapping without an AI call).
- Requires field-level review. Sensitive or unsupported facts are never guessed, and the extension never presses Submit.

## Install the ready build

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the `dist` directory.
5. Pin Fieldcraft, open a job page, and click its toolbar icon — or press **⌥F** / **Alt+F** to open the side panel.

Chrome may ask for access to pages you visit. Fieldcraft needs this to read visible job forms and insert only the answers you approve. It does not analyze a page until you press **Analyze this job**.

## First setup

1. Add identity and public work links.
2. Paste the full text version of the resume. This is the source-of-truth boundary for candidate claims.
3. Optionally attach the actual resume file for file-upload fields.
4. Add explicit work authorization, sponsorship, notice period, compensation, relocation, and reusable answers. Blank means “ask me during review.”
5. Add an OpenAI, Gemini, or custom OpenAI-compatible API key and choose the provider, model, and quality/cost tier. For a custom provider, enter the API **root** URL (e.g. `https://api.fireworks.ai/inference/v1` or `https://openrouter.ai/api/v1`), the provider's model ID, and the API key. Do not include `/chat/completions`; the SDK adds it automatically. Add a separate Exa API key if you enable company research.

By default, the AI provider API key is held in `chrome.storage.session` and disappears when the browser session ends. “Remember API key” stores it in Chrome local extension storage instead. Exa and AI provider keys are stored separately.

## Develop

This project uses [Bun](https://bun.sh/). Run:

```bash
bun install
bun run dev
```

Load the development output shown by CRXJS in `chrome://extensions`. For a production bundle:

```bash
bun run check
bun run test
bun run eval
OPENAI_API_KEY=sk-... bun run eval:live
bun run build
bun run doctor
```

- `bun run eval` — deterministic judges (no network)
- `bun run eval:live` — optional live AI-provider run of the fixture pack (skipped without a configured API key)

Live eval options (env):

| Env | Default | Description |
|-----|---------|-------------|
| `FIELDCRAFT_EVAL_PROVIDER` | `openai` | `openai` \| `gemini` \| `custom` |
| `FIELDCRAFT_EVAL_MODEL` | catalog default (`DEFAULT_EVAL_MODEL_ID`) | Any id from the multi-provider model catalog; for `custom`, the provider model ID |
| `FIELDCRAFT_EVAL_REASONING` | catalog default (`DEFAULT_EVAL_REASONING_EFFORT`) | `none` \| `low` \| `medium` \| `high` \| `xhigh` \| `max` \| `auto` |
| `FIELDCRAFT_EVAL_RESEARCH` | off | Set to `1` to enable company research via Exa |
| `FIELDCRAFT_CUSTOM_BASE_URL` | — | Required when `FIELDCRAFT_EVAL_PROVIDER=custom` |
| `FIELDCRAFT_CUSTOM_MODEL_ID` | — | Shorthand for `FIELDCRAFT_EVAL_MODEL` when `provider=custom` |
| `FIELDCRAFT_CUSTOM_API_KEY` | — | Custom provider API key (falls back to `OPENAI_API_KEY` for evals) |

```bash
OPENAI_API_KEY=sk-... bun run eval:live
OPENAI_API_KEY=sk-... FIELDCRAFT_EVAL_MODEL=<catalog-id> bun run eval:live
OPENAI_API_KEY=sk-... FIELDCRAFT_EVAL_REASONING=high bun run eval:live

# Custom OpenAI-compatible provider (e.g. Fireworks)
FIELDCRAFT_EVAL_PROVIDER=custom \
FIELDCRAFT_CUSTOM_BASE_URL=https://api.fireworks.ai/inference/v1 \
FIELDCRAFT_CUSTOM_MODEL_ID=accounts/fireworks/models/llama-v3p1-405b-instruct \
FIELDCRAFT_CUSTOM_API_KEY=<fireworks-key> \
  bun run eval:live
```

Use `GEMINI_API_KEY=...` instead when running live evals against a Gemini model.

Defaults live in `src/lib/models.ts` only — runtime never hardcodes model or reasoning strings.

## Architecture

- `src/content.ts` reads the active page and applies reviewed values.
- `src/background.ts` owns API calls and the tab-scoped analysis sessions, so the API key never enters page code and switching tabs never shows or redirects another tab's work.
- `src/lib/chrome-events.ts` and `src/lib/chrome-tabs.ts` provide small Chrome extension event/active-tab helpers.
- `src/lib/page.ts` performs generic ATS/form extraction and browser-compatible filling.
- `src/lib/prompt.ts` defines the truthfulness, prompt-injection, writing, and field-action contract.
- `src/lib/enums.ts` is the single source of truth for domain values (fit verdicts, actions, confidence, reasoning effort, model IDs, judge IDs).
- `src/lib/models.ts` defines the multi-provider model catalog and per-tier defaults on top of those enums.
- `src/lib/fit.ts` enforces fit-score invariants after model output.
- `src/lib/openai.ts` calls the selected AI provider through the Vercel AI SDK with structured outputs, response storage disabled for OpenAI, and a privacy-preserving installation identifier.
- `src/lib/ai-provider.ts` creates the correct OpenAI or Gemini language model for the AI SDK.
- `src/lib/direct-fill.ts` builds field suggestions directly from the saved profile and canonical answers, used by Direct autofill mode without any AI call.
- `src/lib/eval/` holds fixtures, deterministic judges, and golden samples for analysis quality gates.
- `src/lib/tab-sessions.ts` guards session identity and run matching for background/sidepanel state.
- `src/lib/dashboard-review.ts` builds review drafts and the default auto-selection of safe fills.
- `src/components/` contains the sidepanel UI, split into `Dashboard.tsx`, `DashboardViews.tsx`, `ProfileEditor.tsx`, `ProfileEditorForm.tsx`, and the `useDashboardBinding` hook.

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
- Live API behavior requires a valid provider API key (OpenAI or Gemini) with access to the selected model. Company research requires a separate Exa API key.
- The extension is intentionally not a mass-apply bot. Review and submission stay with the user.
