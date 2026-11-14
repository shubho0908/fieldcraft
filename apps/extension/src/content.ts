import { collectPageSnapshot, fillPageFields } from "./lib/page";
import { getProfile } from "./lib/storage";
import { inspectFrameHosts, installFrameProbe, type FrameContentRequest } from "./lib/frame-document";
import type { RuntimeRequest } from "./types";

const documentId = crypto.randomUUID();
installFrameProbe(documentId);

chrome.runtime.onMessage.addListener(
  (request: RuntimeRequest | FrameContentRequest, _sender, sendResponse) => {
    if (request.type === "FIELDCRAFT_CAPTURE") {
      void (async () => {
        try {
          const frameHosts = await inspectFrameHosts(document);
          sendResponse({ ok: true, snapshot: collectPageSnapshot(document), documentId, frameHosts });
        } catch (error) {
          sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not read page" });
        }
      })();
      return true;
    }

    if (request.type === "FIELDCRAFT_VALIDATE_DOCUMENT") {
      void inspectFrameHosts(document).then((frameHosts) => {
        sendResponse({ ok: request.url === document.location.href && request.documentId === documentId, frameHosts });
      }).catch(() => sendResponse({ ok: false }));
      return true;
    }

    if (request.type === "FIELDCRAFT_FILL") {
      void (async () => {
        try {
          const matchesDocument = () => request.url === document.location.href && "documentId" in request && request.documentId === documentId;
          if (!matchesDocument()) throw new Error("The page document changed. Review the current page again.");
          const profile = await getProfile();
          if (!matchesDocument()) throw new Error("The page document changed. Review the current page again.");
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
