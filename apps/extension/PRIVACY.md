# Privacy notes

- Candidate profile data and the optional resume attachment are stored in Chrome extension storage on the user's browser profile.
- Resume uploads are parsed on the device. Scanned PDF pages use packaged English OCR; document bytes and rendered pages are not sent to an extraction service. The extracted text becomes part of the candidate profile and is sent to the selected AI provider only when analysis is requested.
- The API key is stored in session storage by default. If “Remember API key” is enabled, Chrome local extension storage is used instead. Local extension storage is not a hardware-backed secret vault.
- When the user presses **Analyze this job**, the candidate profile (without resume file bytes), visible job-page text, and extracted field metadata are sent to the OpenAI Responses API.
- Responses are requested with `store: false`.
- Company research is optional. When enabled, the OpenAI web-search tool may search public sources and return cited URLs.
- The extension does not submit forms, sell data, run analytics, or send telemetry.
