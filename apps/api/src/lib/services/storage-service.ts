import { mkdir, unlink } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { S3Client } from "bun";
import {
  LOCAL_STORAGE_DIR,
  S3_ACCESS_KEY_ID,
  S3_BUCKET,
  S3_CONFIGURED,
  S3_ENDPOINT,
  S3_REGION,
  S3_SECRET_ACCESS_KEY,
} from "$/env";

const SAFE_KEY = /^[a-zA-Z0-9][a-zA-Z0-9/_\-.]*$/;

/** How long a signed download URL works. Short, because every view asks
 * the API for a fresh one after checking who is asking. */
const SIGNED_URL_SECONDS = 5 * 60;

/** Object storage behind one interface: Cloudflare R2 (or any S3) through
 * Bun's built-in S3 client when the S3_* env is present, else a folder on
 * local disk (dev). The bucket is private: nothing is reachable without a
 * signed URL, and those are only handed out by routes that check access. */
class StorageService {
  readonly backend: "s3" | "local" = S3_CONFIGURED ? "s3" : "local";
  #s3: S3Client | null = S3_CONFIGURED
    ? new S3Client({
        accessKeyId: S3_ACCESS_KEY_ID,
        secretAccessKey: S3_SECRET_ACCESS_KEY,
        bucket: S3_BUCKET,
        endpoint: S3_ENDPOINT,
        region: S3_REGION,
      })
    : null;
  readonly localDir = resolve(LOCAL_STORAGE_DIR);

  assertKey(key: string) {
    if (!SAFE_KEY.test(key) || key.includes("..") || key.length > 512)
      throw new Error(`invalid storage key: ${key}`);
    return key;
  }

  #localPath(key: string) {
    const p = resolve(this.localDir, this.assertKey(key));
    const rel = relative(this.localDir, p);
    if (rel.startsWith("..") || rel.split(sep).includes(".."))
      throw new Error(`invalid storage key: ${key}`);
    return p;
  }

  async put(
    key: string,
    data: Uint8Array,
    meta: { contentType: string; fileName: string },
  ) {
    this.assertKey(key);
    if (this.#s3) {
      await this.#s3.write(key, data, {
        type: meta.contentType,
        contentDisposition: contentDisposition(meta.fileName),
      });
      return;
    }
    const path = this.#localPath(key);
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, data);
  }

  async delete(key: string) {
    this.assertKey(key);
    if (this.#s3) {
      await this.#s3.delete(key);
      return;
    }
    await unlink(this.#localPath(key)).catch(() => {});
  }

  /** Short-lived signed URL (S3 only; null on the local backend). */
  signedUrl(key: string) {
    this.assertKey(key);
    return (
      this.#s3?.presign(key, {
        expiresIn: SIGNED_URL_SECONDS,
        method: "GET",
      }) ?? null
    );
  }

  /** The HTTP response that shows a stored file to someone already allowed
   * to see it: a redirect to a signed URL (S3) or the file itself (local). */
  async serve(
    key: string,
    meta: { contentType: string; fileName: string },
  ): Promise<Response> {
    const headers = { "Cache-Control": "private, no-store" };
    const url = this.signedUrl(key);
    if (url)
      return new Response(null, {
        status: 302,
        headers: { ...headers, Location: url },
      });
    const file = Bun.file(this.#localPath(key));
    if (!(await file.exists())) return new Response(null, { status: 404 });
    return new Response(file, {
      headers: {
        ...headers,
        "Content-Type": meta.contentType,
        "Content-Disposition": contentDisposition(meta.fileName),
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  /** write, read back through a signed URL, delete - proves the credentials */
  async probe() {
    const key = `probes/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`;
    const body = new TextEncoder().encode(`storage probe ${Date.now()}`);
    try {
      await this.put(key, body, {
        contentType: "text/plain",
        fileName: "probe.txt",
      });
      const res = await this.serve(key, {
        contentType: "text/plain",
        fileName: "probe.txt",
      });
      const location = res.headers.get("Location");
      const back = new Uint8Array(
        await (location ? await fetch(location) : res).arrayBuffer(),
      );
      await this.delete(key);
      const ok = Buffer.compare(Buffer.from(back), Buffer.from(body)) === 0;
      return { ok, backend: this.backend, error: ok ? null : "mismatch" };
    } catch (e) {
      return {
        ok: false,
        backend: this.backend,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}

/** `inline` so images and PDFs open in the browser tab. */
function contentDisposition(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export const storageService = new StorageService();
