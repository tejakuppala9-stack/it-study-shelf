import type { Express } from "express";
import { Readable } from "node:stream";
import { ENV } from "./env";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      const fileResp = await fetch(url);
      if (!fileResp.ok || !fileResp.body) {
        console.error(`[StorageProxy] file fetch error: ${fileResp.status}`);
        res.status(502).send("Stored file unavailable");
        return;
      }

      const contentType = fileResp.headers.get("content-type") || "application/octet-stream";
      const contentLength = fileResp.headers.get("content-length");
      res.setHeader("Content-Type", contentType);
      if (contentLength) res.setHeader("Content-Length", contentLength);
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("Cache-Control", "private, max-age=300");
      Readable.fromWeb(fileResp.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      if (!res.headersSent) res.status(502).send("Storage proxy error");
      else res.end();
    }
  });
}
