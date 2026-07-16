/** Subscribe to a Chrome event and return an unsubscribe function. */
export function subscribeChromeEvent<T extends (...args: never[]) => void>(
  event: {
    addListener: (callback: T) => void;
    removeListener: (callback: T) => void;
  },
  callback: T,
): () => void {
  event.addListener(callback);
  return () => {
    event.removeListener(callback);
  };
}
