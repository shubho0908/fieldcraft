type TextContentBlock = { type: "text"; text: string };

type AnthropicMessage = {
  role?: string;
  content?: unknown;
};

type AnthropicRequest = {
  messages?: AnthropicMessage[];
  system?: unknown;
};

function isTextContentBlock(value: unknown): value is TextContentBlock {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>).type === "text" &&
    typeof (value as Record<string, unknown>).text === "string"
  );
}

function isTextContentArray(value: unknown): value is TextContentBlock[] {
  return Array.isArray(value) && value.every(isTextContentBlock);
}

function textContentToString(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (isTextContentArray(content)) {
    return content.map((block) => block.text).join("");
  }
  return undefined;
}

function normalizeMessageContent(content: unknown): unknown {
  const asString = textContentToString(content);
  return asString === undefined ? content : asString;
}

function normalizeBody(body: string): { init: RequestInit; changed: boolean } {
  try {
    const parsed = JSON.parse(body) as AnthropicRequest;
    if (!parsed || typeof parsed !== "object") {
      return { init: { body }, changed: false };
    }

    let changed = false;
    const systemParts: string[] = [];
    const messages: AnthropicMessage[] = [];

    for (const message of parsed.messages ?? []) {
      if (message.role === "system") {
        const text = textContentToString(message.content);
        if (text !== undefined) {
          systemParts.push(text);
          changed = true;
          continue;
        }
      }

      const normalized = normalizeMessageContent(message.content);
      if (normalized !== message.content) {
        changed = true;
      }
      messages.push({ ...message, content: normalized });
    }

    const next: AnthropicRequest = { ...parsed, messages };

    if (systemParts.length > 0) {
      const existing = textContentToString(parsed.system);
      const combined = [existing, ...systemParts]
        .filter((part): part is string => part !== undefined && part.length > 0)
        .join("\n\n");
      next.system = combined;
      changed = true;
    }

    return changed
      ? { init: { body: JSON.stringify(next) }, changed: true }
      : { init: { body }, changed: false };
  } catch {
    return { init: { body }, changed: false };
  }
}

function normalizeRequestInit(init?: RequestInit): RequestInit | undefined {
  if (!init?.body || typeof init.body !== "string") return init;

  const contentType =
    typeof init.headers === "object" && init.headers !== null
      ? (init.headers as Record<string, string>)["content-type"] ??
        (init.headers as Record<string, string>)["Content-Type"]
      : undefined;

  if (
    contentType &&
    !contentType.includes("application/json") &&
    !contentType.includes("application/") // be lenient
  ) {
    return init;
  }

  const { init: nextInit, changed } = normalizeBody(init.body);
  return changed ? { ...init, ...nextInit } : init;
}

export function createAnthropicCompatibleFetch(
  baseFetch: typeof globalThis.fetch = globalThis.fetch,
): typeof globalThis.fetch {
  return async (input, init) => {
    return baseFetch(input, normalizeRequestInit(init));
  };
}
