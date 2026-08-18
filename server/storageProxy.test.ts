import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/env", () => ({
  ENV: { forgeApiUrl: "https://forge.example", forgeApiKey: "test-key" },
}));

import { registerStorageProxy } from "./_core/storageProxy";

describe("storage proxy", () => {
  afterEach(() => vi.restoreAllMocks());

  it("streams a stored PDF inline with browser-compatible headers", async () => {
    let handler: (req: any, res: any) => Promise<void>;
    const app = { get: vi.fn((_path: string, callback: typeof handler) => { handler = callback; }) };
    registerStorageProxy(app as any);

    const pdf = Buffer.from("%PDF-1.7\nmock pdf");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: "https://signed.example/file.pdf" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(pdf, { status: 200, headers: { "content-type": "application/pdf", "content-length": String(pdf.length) } }));

    const body = new PassThrough();
    const chunks: Buffer[] = [];
    body.on("data", chunk => chunks.push(Buffer.from(chunk)));
    const headers = new Map<string, string>();
    const res = Object.assign(body, {
      setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), value),
      status: vi.fn(() => res),
      send: vi.fn(() => res),
      headersSent: false,
    });

    await handler!({ params: { 0: "study-materials/1/file.pdf" } }, res);
    await new Promise(resolve => body.on("end", resolve));

    expect(headers.get("content-type")).toBe("application/pdf");
    expect(headers.get("content-disposition")).toBe("inline");
    expect(Buffer.concat(chunks).toString()).toContain("%PDF-1.7");
  });
});
