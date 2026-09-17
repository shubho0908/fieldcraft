import { useEffect, useRef, useState } from "react";
import { subscribeChromeEvent } from "../lib/chrome-events";
import { getActiveTab, tabBindingKey } from "../lib/chrome-tabs";
import { isAnalyzableTabUrl } from "../lib/page";
import { normalizeSession } from "../lib/tab-sessions";
import { isOverlayHost } from "../lib/ui-host";
import type { ResolvedActiveTab, RuntimeRequest, TabAnalysisSession } from "../types";

type TabBinding = { id: number; url: string };

export function useDashboardBinding() {
  const [binding, setBinding] = useState<TabBinding | null>(null);
  const [bindIssue, setBindIssue] = useState("");
  const [session, setSession] = useState<TabAnalysisSession | null>(null);
  const bindingKeyRef = useRef("");
  const sessionRequestRef = useRef(0);

  useEffect(() => {
    const overlay = isOverlayHost();
    let disposed = false;
    let bindingRequest = 0;
    let ownerTabId: number | undefined;

    function clearBinding(reason: string) {
      sessionRequestRef.current += 1;
      bindingKeyRef.current = "";
      setBinding(null);
      setSession(null);
      setBindIssue(reason);
    }

    function applyBinding(tab: { id: number; url: string }) {
      if (overlay) {
        if (ownerTabId != null && ownerTabId !== tab.id) {
          clearBinding("Could not identify this overlay's tab. Reopen Fieldcraft.");
          return;
        }
        ownerTabId = tab.id;
      }
      if (!isAnalyzableTabUrl(tab.url)) {
        clearBinding("Open a public http(s) page, then try again.");
        return;
      }

      const nextBinding = { id: tab.id, url: tab.url };
      const key = tabBindingKey(nextBinding.id, nextBinding.url);
      if (bindingKeyRef.current === key) {
        setBindIssue("");
        return;
      }

      bindingKeyRef.current = key;
      setBinding(nextBinding);
      setBindIssue("");
      setSession(null);
      const sessionRequest = ++sessionRequestRef.current;
      void chrome.runtime
        .sendMessage({
          type: "FIELDCRAFT_GET_TAB_SESSION",
          tabId: nextBinding.id,
        } satisfies RuntimeRequest)
        .then((response) => {
          if (disposed || sessionRequestRef.current !== sessionRequest || bindingKeyRef.current !== key) return;
          if (!response?.ok) throw new Error(response?.error || "Could not read tab state");
          const next = normalizeSession((response.session as TabAnalysisSession | null) ?? null);
          setSession(next?.url === nextBinding.url ? next : null);
        })
        .catch(() => {
          if (!disposed && sessionRequestRef.current === sessionRequest && bindingKeyRef.current === key) setSession(null);
        });
    }

    function bindFromChromeTab(tab: chrome.tabs.Tab) {
      const url = tab.url || tab.pendingUrl;
      if (!tab.id || !url) {
        if (tab.id && bindingKeyRef.current.startsWith(`${tab.id}:`)) return;
        clearBinding("Could not read this tab's URL. Reload the page, then reopen Fieldcraft.");
        return;
      }
      applyBinding({ id: tab.id, url });
    }

    async function refreshBoundTab() {
      const request = ++bindingRequest;
      try {
        const response = await chrome.runtime.sendMessage({
          type: "FIELDCRAFT_RESOLVE_ACTIVE_TAB",
        } satisfies RuntimeRequest);
        if (disposed || request !== bindingRequest) return;
        if (!response?.ok) {
          clearBinding(response?.error || "Could not read the active tab.");
          return;
        }
        const tab = response.tab as ResolvedActiveTab | null;
        if (!tab) {
          clearBinding("Focus a public web tab, then open Fieldcraft again.");
          return;
        }
        applyBinding(tab);
      } catch {
        if (disposed || request !== bindingRequest) return;
        if (overlay) {
          clearBinding("Could not read this overlay's tab. Reopen Fieldcraft.");
          return;
        }
        try {
          const tab = await getActiveTab();
          if (!disposed && request === bindingRequest) bindFromChromeTab(tab);
        } catch {
          if (!disposed && request === bindingRequest) clearBinding("Could not read the active tab.");
        }
      }
    }

    void refreshBoundTab();

    const onActivated = () => {
      void refreshBoundTab();
    };
    const onUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (!bindingKeyRef.current.startsWith(`${tabId}:`)) return;
      if (!changeInfo.url && changeInfo.status !== "complete") return;
      const request = ++bindingRequest;
      if (changeInfo.url) {
        applyBinding({ id: tabId, url: changeInfo.url });
        return;
      }
      if (changeInfo.status === "complete") {
        void chrome.tabs.get(tabId).then((tab) => {
          if (!disposed && request === bindingRequest) bindFromChromeTab(tab);
        }).catch(() => undefined);
      }
    };

    const stopActivated = overlay ? undefined : subscribeChromeEvent(chrome.tabs.onActivated, onActivated);
    const stopUpdated = subscribeChromeEvent(chrome.tabs.onUpdated, onUpdated);
    return () => {
      disposed = true;
      bindingRequest += 1;
      sessionRequestRef.current += 1;
      bindingKeyRef.current = "";
      stopActivated?.();
      stopUpdated();
    };
  }, []);

  useEffect(() => {
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      // Safari <16.4 (and some other contexts) fall back to chrome.storage.local
      // for tab sessions, so we react to both session and local changes here.
      if (area === "managed" || !changes["fieldcraft.tabAnalysisSessions"] || !binding) return;
      if (bindingKeyRef.current !== tabBindingKey(binding.id, binding.url)) return;
      sessionRequestRef.current += 1;
      const sessions = changes["fieldcraft.tabAnalysisSessions"].newValue as
        | Record<string, TabAnalysisSession>
        | undefined;
      const next = normalizeSession(sessions?.[String(binding.id)] ?? null);
      setSession(next?.url === binding.url ? next : null);
    };
    return subscribeChromeEvent(chrome.storage.onChanged, onChanged);
  }, [binding]);

  return { binding, bindIssue, session, setSession };
}
