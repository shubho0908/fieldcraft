export async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [lastFocused] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (lastFocused) return lastFocused;
  const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
  return current ?? {};
}

export function tabBindingKey(id: number, url: string): string {
  return `${id}:${url}`;
}
