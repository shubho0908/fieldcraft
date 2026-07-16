import { analyzeJob, testOpenAiConnection } from "./lib/openai";
import type { RuntimeRequest } from "./types";

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener(
  (request: RuntimeRequest, _sender, sendResponse) => {
    if (request.type === "FIELDCRAFT_ANALYZE") {
      void analyzeJob(request.snapshot, request.profile, request.settings)
        .then((analysis) => sendResponse({ ok: true, analysis }))
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Analysis failed",
          }),
        );
      return true;
    }

    if (request.type === "FIELDCRAFT_TEST_API") {
      void testOpenAiConnection(request.model)
        .then((result) =>
          sendResponse({
            ok: true,
            model: result.model,
            responseId: result.responseId,
          }),
        )
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Connection failed",
          }),
        );
      return true;
    }

    return false;
  },
);
