# Fieldcraft

Fieldcraft is a local-first Chrome MV3 extension that reads a job/application page, evaluates it against a saved candidate profile, researches the company, drafts concise evidence-backed answers, and fills only the fields the user selects. It never submits an application.

## What it does

- Keeps a structured candidate profile, full resume text, proof points, work-authorization defaults, compensation/notice-period facts, canonical answers, and an optional resume attachment in Chrome extension storage.
- Extracts visible JD content and up to 100 application controls from Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Jobvite, iCIMS, BambooHR, Wellfound, LinkedIn, and generic forms.
- Uses the OpenAI Responses API with structured output and optional live web search.
- Produces an honest fit score, hard blockers, company brief with clickable sources, missing-fact list, and one reviewed suggestion per detected field.
- Handles textareas, native selects, radio groups, checkboxes, contenteditable controls, and resume file inputs.
- Requires field-level review. Sensitive or unsupported facts are never guessed, and the extension never presses Submit.

## Install the ready build

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the `dist` directory.
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

```bash
npm install
npm run dev
```

Load the development output shown by CRXJS in `chrome://extensions`. For a production bundle:

```bash
npm run check
npm test
npm run build
```

## Architecture

- `src/content.ts` reads the active page and applies reviewed values.
- `src/background.ts` owns API calls so the API key never enters page code.
- `src/lib/page.ts` performs generic ATS/form extraction and browser-compatible filling.
- `src/lib/prompt.ts` defines the truthfulness, prompt-injection, writing, and field-action contract.
- `src/lib/openai.ts` calls the Responses API with structured outputs, web search, response storage disabled, and a privacy-preserving installation identifier.
- `src/components/` contains onboarding, candidate settings, analysis, research, and field-review UI.

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
