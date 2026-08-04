export async function getActiveTab(): Promise<chrome.tabs.Tab> {
  try {
    const [lastFocused] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (lastFocused) return lastFocused;
  } catch {
    // lastFocusedWindow is not supported by Safari WebExtensions.
  }

  const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
  return current ?? {};
}

export function tabBindingKey(id: number, url: string): string {
  return `${id}:${url}`;
}
