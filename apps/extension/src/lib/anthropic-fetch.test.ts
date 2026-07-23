import { describe, expect, it, vi } from "vitest";
import { createAnthropicCompatibleFetch } from "./anthropic-fetch";

describe("createAnthropicCompatibleFetch", () => {
  it("passes non-JSON bodies through unchanged", async () => {
    const baseFetch = vi.fn().mockResolvedValue(new Response("ok"));
    const fetch = createAnthropicCompatibleFetch(baseFetch as unknown as typeof fetch);
    await fetch("https://api.example.com/v1/messages", {
      method: "POST",
      body: "not-json",
    } as RequestInit);
    expect(baseFetch).toHaveBeenCalledWith(
      "https://api.example.com/v1/messages",
      expect.objectContaining({ body: "not-json" }),
    );
  });

  it("converts text-only content arrays to strings", async () => {
    const baseFetch = vi.fn().mockResolvedValue(new Response("ok"));
    const fetch = createAnthropicCompatibleFetch(baseFetch as unknown as typeof fetch);
    const body = JSON.stringify({
      model: "claude-test",
      max_tokens: 96,
      messages: [
        {
          role: "user",
          content: [{ type: "text" as const, text: "Reply with exactly: connected" }],
        },
      ],
    });

    await fetch("https://api.example.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    } as RequestInit);

    const init = baseFetch.mock.calls[0][1] as RequestInit;
    const sent = JSON.parse(init.body as string);
    expect(sent.messages[0].content).toBe("Reply with exactly: connected");
  });

  it("hoists inline system messages to the top-level system field", async () => {
    const baseFetch = vi.fn().mockResolvedValue(new Response("ok"));
    const fetch = createAnthropicCompatibleFetch(baseFetch as unknown as typeof fetch);
    const body = JSON.stringify({
      model: "claude-test",
      max_tokens: 96,
      messages: [
        { role: "system", content: [{ type: "text" as const, text: "Be concise." }] },
        {
          role: "user",
          content: [{ type: "text" as const, text: "Hi." }],
        },
      ],
    });

    await fetch("https://api.example.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    } as RequestInit);

    const init = baseFetch.mock.calls[0][1] as RequestInit;
    const sent = JSON.parse(init.body as string);
    expect(sent.messages).toHaveLength(1);
    expect(sent.messages[0].role).toBe("user");
    expect(sent.system).toBe("Be concise.");
  });

  it("merges multiple system sources into a single top-level string", async () => {
    const baseFetch = vi.fn().mockResolvedValue(new Response("ok"));
    const fetch = createAnthropicCompatibleFetch(baseFetch as unknown as typeof fetch);
    const body = JSON.stringify({
      model: "claude-test",
      max_tokens: 96,
      system: [{ type: "text" as const, text: "First." }],
      messages: [
        { role: "system", content: "Second." },
        { role: "user", content: "Hi." },
      ],
    });

    await fetch("https://api.example.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    } as RequestInit);

    const init = baseFetch.mock.calls[0][1] as RequestInit;
    const sent = JSON.parse(init.body as string);
    expect(sent.system).toBe("First.\n\nSecond.");
  });

  it("leaves multimodal or non-text content arrays intact", async () => {
    const baseFetch = vi.fn().mockResolvedValue(new Response("ok"));
    const fetch = createAnthropicCompatibleFetch(baseFetch as unknown as typeof fetch);
    const body = JSON.stringify({
      model: "claude-test",
      max_tokens: 96,
      messages: [
        {
          role: "user",
          content: [
            { type: "image" as const, source: { type: "base64", media_type: "image/png", data: "abc" } },
            { type: "text" as const, text: "describe this" },
          ],
        },
      ],
    });

    await fetch("https://api.example.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    } as RequestInit);

    const init = baseFetch.mock.calls[0][1] as RequestInit;
    const sent = JSON.parse(init.body as string);
    expect(sent.messages[0].content).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: "abc" } },
      { type: "text", text: "describe this" },
    ]);
  });
});
