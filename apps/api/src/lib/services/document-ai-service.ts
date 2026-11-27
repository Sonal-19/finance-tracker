import { createSign } from "node:crypto";
import { DOCAI } from "$/env";
import type { Box, OcrPage, OcrWord } from "$/lib/utils/receipt";

// Google Document AI over plain HTTPS: no Google SDK. Auth is a service
// account key (base64 JSON in GOOGLE_SERVICE_ACCOUNT_KEY_B64): we sign a JWT
// with it, swap that for an access token, and keep the token until shortly
// before it expires.

type ServiceAccount = {
  client_email: string;
  private_key: string;
  private_key_id?: string;
  token_uri?: string;
};

function readKey(): ServiceAccount | null {
  if (!DOCAI.serviceAccountB64) return null;
  try {
    const key = JSON.parse(
      Buffer.from(DOCAI.serviceAccountB64, "base64").toString("utf8"),
    ) as ServiceAccount;
    return key.client_email && key.private_key ? key : null;
  } catch {
    console.error("GOOGLE_SERVICE_ACCOUNT_KEY_B64 is not base64 JSON");
    return null;
  }
}

type Anchor = { textSegments?: { startIndex?: string; endIndex?: string }[] };
type Layout = {
  textAnchor?: Anchor;
  confidence?: number;
  boundingPoly?: {
    vertices?: { x?: number; y?: number }[];
    normalizedVertices?: { x?: number; y?: number }[];
  };
};
type DocAiDocument = {
  text?: string;
  pages?: {
    dimension?: { width?: number; height?: number };
    lines?: { layout?: Layout }[];
    tokens?: { layout?: Layout }[];
  }[];
};

export class DocumentAiError extends Error {
  constructor(
    message: string,
    /** worth trying again (Google busy, timeout) */
    readonly retryable = false,
  ) {
    super(message);
  }
}

const span = (a?: Anchor): [number, number] => {
  const s = a?.textSegments?.[0];
  return s ? [Number(s.startIndex ?? 0), Number(s.endIndex ?? 0)] : [0, 0];
};

/** Document AI's first page as plain words with normalised boxes. */
export function toOcrPage(doc: DocAiDocument): OcrPage {
  const page = doc.pages?.[0];
  const text = doc.text ?? "";
  const width = page?.dimension?.width ?? 1;
  const height = page?.dimension?.height ?? 1;
  const lineSpans = (page?.lines ?? []).map((l) => span(l.layout?.textAnchor));
  const words: OcrWord[] = [];
  for (const t of page?.tokens ?? []) {
    const [s, e] = span(t.layout?.textAnchor);
    const word = text.slice(s, e).replace(/\s+$/, "");
    if (!word) continue;
    const poly = t.layout?.boundingPoly;
    const pts = poly?.normalizedVertices?.length
      ? poly.normalizedVertices.map((v) => [v.x ?? 0, v.y ?? 0])
      : (poly?.vertices ?? []).map((v) => [
          (v.x ?? 0) / width,
          (v.y ?? 0) / height,
        ]);
    if (!pts.length) continue;
    const xs = pts.map((p) => p[0]!);
    const ys = pts.map((p) => p[1]!);
    const r = (n: number) =>
      Math.round(Math.min(1, Math.max(0, n)) * 1e4) / 1e4;
    const box: Box = [
      r(Math.min(...xs)),
      r(Math.min(...ys)),
      r(Math.max(...xs)),
      r(Math.max(...ys)),
    ];
    const line = lineSpans.findIndex(([ls, le]) => s >= ls && s < le);
    words.push({ text: word, box, line: line < 0 ? -1 - words.length : line });
  }
  return { width, height, words };
}

class DocumentAiService {
  #key = readKey();
  #token: string | null = null;
  #tokenUntil = 0;

  get configured() {
    return !!(this.#key && DOCAI.projectId && DOCAI.processorId);
  }

  #jwt(key: ServiceAccount) {
    const b64 = (o: object) =>
      Buffer.from(JSON.stringify(o)).toString("base64url");
    const iat = Math.floor(Date.now() / 1000);
    const unsigned = `${b64({ alg: "RS256", typ: "JWT", ...(key.private_key_id && { kid: key.private_key_id }) })}.${b64(
      {
        iss: key.client_email,
        scope: "https://www.googleapis.com/auth/cloud-platform",
        aud: key.token_uri ?? "https://oauth2.googleapis.com/token",
        iat,
        exp: iat + 3600,
      },
    )}`;
    const sig = createSign("RSA-SHA256")
      .update(unsigned)
      .sign(key.private_key, "base64url");
    return `${unsigned}.${sig}`;
  }

  async #accessToken() {
    if (this.#token && this.#tokenUntil > Date.now() + 5 * 60_000)
      return this.#token;
    const key = this.#key;
    if (!key)
      throw new DocumentAiError("Receipt scanning isn't set up on the server");
    const res = await fetch(
      key.token_uri ?? "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: this.#jwt(key),
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) {
      console.error(
        "Document AI auth failed:",
        res.status,
        await res.text().catch(() => ""),
      );
      throw new DocumentAiError(
        "Receipt scanning couldn't sign in to Google",
        res.status >= 500,
      );
    }
    const body = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.#token = body.access_token;
    this.#tokenUntil = Date.now() + body.expires_in * 1000;
    return this.#token;
  }

  /** OCR of one image or PDF (first page). Retries once when Google is busy. */
  async read(data: Uint8Array, mimeType: string): Promise<OcrPage> {
    const url = `https://${DOCAI.location}-documentai.googleapis.com/v1/projects/${DOCAI.projectId}/locations/${DOCAI.location}/processors/${DOCAI.processorId}:process`;
    const body = JSON.stringify({
      skipHumanReview: true,
      // Without the mask the response echoes the whole image back as base64.
      fieldMask: "text,pages.dimension,pages.lines,pages.tokens",
      // English + Hindi: keeps ₹ as ₹ (not "7") and stops capitals being
      // read as Greek.
      processOptions: { ocrConfig: { hints: { languageHints: ["en", "hi"] } } },
      rawDocument: { mimeType, content: Buffer.from(data).toString("base64") },
    });
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await this.#accessToken()}`,
            "Content-Type": "application/json",
          },
          body,
          signal: AbortSignal.timeout(30_000),
        });
      } catch (e) {
        if (e instanceof DocumentAiError) throw e;
        if (attempt === 0) continue;
        throw new DocumentAiError(
          "Couldn't reach the scanner. Try again.",
          true,
        );
      }
      if (res.ok)
        return toOcrPage(
          ((await res.json()) as { document?: DocAiDocument }).document ?? {},
        );
      const detail = await res.text().catch(() => "");
      if (res.status === 401) this.#token = null;
      if (
        (res.status === 429 || res.status >= 500 || res.status === 401) &&
        attempt === 0
      ) {
        await Bun.sleep(600);
        continue;
      }
      console.error("Document AI failed:", res.status, detail.slice(0, 500));
      throw new DocumentAiError(
        res.status === 429
          ? "The scanner is busy. Try again in a minute."
          : "The scanner couldn't read that image",
        res.status === 429 || res.status >= 500,
      );
    }
  }
}

export const documentAiService = new DocumentAiService();
