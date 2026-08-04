import { useEffect, useRef, useState } from "react";
import { subscribeChromeEvent } from "../lib/chrome-events";
import { getActiveTab, tabBindingKey } from "../lib/chrome-tabs";
import { isAnalyzableTabUrl } from "../lib/page";
import { normalizeSession } from "../lib/tab-sessions";
import type { ResolvedActiveTab, RuntimeRequest, TabAnalysisSession } from "../types";

type TabBinding = { id: number; url: string };

export function useDashboardBinding() {
  const [binding, setBinding] = useState<TabBinding | null>(null);
  const [bindIssue, setBindIssue] = useState("");
  const [session, setSession] = useState<TabAnalysisSession | null>(null);
  const bindingKeyRef = useRef("");

  useEffect(() => {
    function clearBinding(reason: string) {
      bindingKeyRef.current = "";
      setBinding(null);
      setSession(null);
      setBindIssue(reason);
    }

    function applyBinding(tab: { id: number; url: string }) {
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
      void chrome.runtime
        .sendMessage({
          type: "FIELDCRAFT_GET_TAB_SESSION",
          tabId: nextBinding.id,
        } satisfies RuntimeRequest)
        .then((response) => {
          if (bindingKeyRef.current !== key) return;
          if (!response?.ok) throw new Error(response?.error || "Could not read tab state");
          setSession(normalizeSession((response.session as TabAnalysisSession | null) ?? null));
        })
        .catch(() => {
          if (bindingKeyRef.current === key) setSession(null);
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
      try {
        const response = await chrome.runtime.sendMessage({
          type: "FIELDCRAFT_RESOLVE_ACTIVE_TAB",
        } satisfies RuntimeRequest);
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
        bindFromChromeTab(await getActiveTab());
      }
    }

    void refreshBoundTab();

    const onActivated = () => {
      void refreshBoundTab();
    };
    const onUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (!bindingKeyRef.current.startsWith(`${tabId}:`)) return;
      if (changeInfo.url) {
        applyBinding({ id: tabId, url: changeInfo.url });
        return;
      }
      if (changeInfo.status === "complete") {
        void chrome.tabs.get(tabId).then(bindFromChromeTab).catch(() => undefined);
      }
    };

    const stopActivated = subscribeChromeEvent(chrome.tabs.onActivated, onActivated);
    const stopUpdated = subscribeChromeEvent(chrome.tabs.onUpdated, onUpdated);
    return () => {
      stopActivated();
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
