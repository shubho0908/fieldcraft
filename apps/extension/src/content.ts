import { buildDirectSuggestions } from "./lib/direct-fill";
import { collectPageSnapshot, fillPageFields } from "./lib/page";
import { getProfile } from "./lib/storage";
import type { RuntimeRequest } from "./types";

chrome.runtime.onMessage.addListener(
  (request: RuntimeRequest, _sender, sendResponse) => {
    if (request.type === "FIELDCRAFT_CAPTURE") {
      try {
        sendResponse({ ok: true, snapshot: collectPageSnapshot(document) });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Could not read page",
        });
      }
      return false;
    }

    if (request.type === "FIELDCRAFT_FILL") {
      void (async () => {
        try {
          const profile = await getProfile();
          const results = await fillPageFields(
            request.suggestions,
            document,
            profile.resumeAttachment,
          );
          sendResponse({ ok: true, results });
        } catch (error) {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Could not fill page",
          });
        }
      })();
      return true;
    }

    if (request.type === "FIELDCRAFT_DIRECT_FILL") {
      void (async () => {
        try {
          const snapshot = collectPageSnapshot(document);
          const profile = await getProfile();
          const suggestions = buildDirectSuggestions(snapshot, profile);
          const results = await fillPageFields(
            suggestions,
            document,
            profile.resumeAttachment,
          );
          sendResponse({ ok: true, results });
        } catch (error) {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Could not direct-fill page",
          });
        }
      })();
      return true;
    }

    return false;
  },
);
