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
          if (request.url !== document.location.href) throw new Error("The page changed. Review the current page again.");
          const profile = await getProfile();
          const results = await fillPageFields(
            request.suggestions,
            document,
            profile.resumeAttachment,
            new Set(request.selectedFieldIds),
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

    return false;
  },
);
