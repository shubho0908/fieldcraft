import { useEffect, useRef, useState } from "react";
import { subscribeChromeEvent } from "../lib/chrome-events";
import { tabBindingKey } from "../lib/chrome-tabs";
import { isAnalyzableTabUrl } from "../lib/page";
import { getPanelBoundTab, KEYS, type PanelBoundTab } from "../lib/storage";
import { normalizeSession } from "../lib/tab-sessions";
import type { RuntimeRequest, TabAnalysisSession } from "../types";

type TabBinding = { id: number; url: string };

export function useDashboardBinding() {
  const [binding, setBinding] = useState<TabBinding | null>(null);
  const [bindIssue, setBindIssue] = useState("");
  const [session, setSession] = useState<TabAnalysisSession | null>(null);
  const bindingKeyRef = useRef("");
  const boundRef = useRef<PanelBoundTab | null>(null);

  // Bind to the panel's target tab (the one the side panel was opened for),
  // not the currently active tab. Switching tabs hides the panel; returning to
  // the bound tab reopens it, and the dashboard still reflects the same job.
  useEffect(() => {
    let mounted = true;
    const unsubs: Array<() => void> = [];

    function clearBinding(reason: string) {
      bindingKeyRef.current = "";
      boundRef.current = null;
      setBinding(null);
      setSession(null);
      setBindIssue(reason);
    }

    async function resolveBound(): Promise<PanelBoundTab | null> {
      try {
        const win = await chrome.windows.getCurrent();
        return await getPanelBoundTab(win.id ?? -1);
      } catch {
        return null;
      }
    }

    function applyBound(bound: PanelBoundTab | null) {
      if (!mounted) return;
      boundRef.current = bound;

      if (!bound) {
        clearBinding("Open Fieldcraft from the job tab you want to work on.");
        return;
      }

      void chrome.tabs
        .get(bound.tabId)
        .then((tab) => {
          const url = tab.url || tab.pendingUrl || bound.url || "";
          if (!url) {
            clearBinding("Could not read this tab's URL. Reload the page, then reopen Fieldcraft.");
            return;
          }

          if (!isAnalyzableTabUrl(url)) {
            clearBinding("Open a public http(s) page, then try again.");
            return;
          }

          const nextBinding = { id: bound.tabId, url };
          const key = tabBindingKey(nextBinding.id, nextBinding.url);
          if (bindingKeyRef.current === key) {
            setBindIssue("");
            return;
          }

          bindingKeyRef.current = key;
          setBinding(nextBinding);
          setBindIssue("");
          setSession(null);

          return chrome.runtime.sendMessage({
            type: "FIELDCRAFT_GET_TAB_SESSION",
            tabId: nextBinding.id,
          } satisfies RuntimeRequest);
        })
        .then((response) => {
          if (!mounted) return;
          if (response && typeof response === "object") {
            const key = bindingKeyRef.current;
            if (!key) return;
            if (!response.ok) throw new Error(response.error || "Could not read tab state");
            setSession(normalizeSession((response.session as TabAnalysisSession | null) ?? null));
          }
        })
        .catch(() => {
          if (!mounted) return;
          if (bindingKeyRef.current) setSession(null);
        });
    }

    void resolveBound().then(applyBound);

    const stopBoundChanged = subscribeChromeEvent(chrome.storage.onChanged, (changes, area) => {
      if (area !== "session" || !changes[KEYS.panelBoundTabs]) return;
      const winId = boundRef.current?.windowId;
      if (winId == null) return;
      const record = changes[KEYS.panelBoundTabs].newValue as
        | Record<string, PanelBoundTab>
        | undefined;
      applyBound(record?.[String(winId)] ?? null);
    });
    unsubs.push(stopBoundChanged);

    const stopUpdated = subscribeChromeEvent(chrome.tabs.onUpdated, (tabId, changeInfo) => {
      if (tabId !== boundRef.current?.tabId) return;
      if (changeInfo.url && boundRef.current) {
        applyBound({ ...boundRef.current, url: changeInfo.url });
      } else if (changeInfo.status === "complete") {
        void chrome.tabs
          .get(tabId)
          .then((tab) => {
            const url = tab.url || tab.pendingUrl || boundRef.current?.url || "";
            if (url && boundRef.current) {
              applyBound({ ...boundRef.current, url });
            }
          })
          .catch(() => undefined);
      }
    });
    unsubs.push(stopUpdated);

    const stopRemoved = subscribeChromeEvent(chrome.tabs.onRemoved, (removedTabId) => {
      if (removedTabId === boundRef.current?.tabId) {
        clearBinding("The job tab was closed.");
      }
    });
    unsubs.push(stopRemoved);

    return () => {
      mounted = false;
      unsubs.forEach((fn) => fn());
    };
  }, []);

  // Keep the dashboard session in sync with the background's stored session
  // for the bound tab.
  useEffect(() => {
    if (!binding) return;
    const stopSessionChanged = subscribeChromeEvent(
      chrome.storage.onChanged,
      (changes, area) => {
        if (area !== "session" || !changes[KEYS.tabSessions]) return;
        const sessions = changes[KEYS.tabSessions].newValue as
          | Record<string, TabAnalysisSession>
          | undefined;
        const next = normalizeSession(sessions?.[String(binding.id)] ?? null);
        setSession(next?.url === binding.url ? next : null);
      },
    );
    return stopSessionChanged;
  }, [binding]);

  return { binding, bindIssue, session, setSession };
}
