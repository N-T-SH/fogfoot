import { del, get, list, put } from "@vercel/blob";
import type { Store } from "./coverage";

/** Vercel Blob adapter. The store is private: nothing is readable except through our own endpoints. */
export const blobStore: Store = {
  async put(path, body) {
    await put(path, body, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" });
  },
  async list(prefix) {
    const out: string[] = [];
    let cursor: string | undefined;
    do {
      const r = await list({ prefix, cursor, limit: 1000 });
      out.push(...r.blobs.map((b) => b.pathname));
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor);
    return out;
  },
  async read(path) {
    const r = await get(path, { access: "private", useCache: false });
    if (!r || r.statusCode !== 200 || !r.stream) return null;
    return await new Response(r.stream).text();
  },
  async del(paths) {
    if (paths.length) await del(paths);
  },
};
