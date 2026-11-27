import Elysia, { t } from "elysia";
import type { SelectUser } from "$/db/schema";
import {
  isImageType,
  MAX_ATTACHMENT_BYTES,
  sniffType,
} from "$/lib/services/attachment-service";
import {
  DocumentAiError,
  documentAiService,
} from "$/lib/services/document-ai-service";
import { rateLimitService } from "$/lib/services/rate-limit-service";
import { scanReceipt } from "$/lib/services/receipt-service";
import { systemConfigService } from "$/lib/services/system-config-service";
import { fail, ok } from "$/lib/utils";
import { protectedUser } from "$/pre-processor";

/** Whether this user gets the scan button right now. */
function canScan(user: Pick<SelectUser, "role">) {
  if (!documentAiService.configured) return false;
  const { AVAILABILITY } = systemConfigService.SYSTEM_CONFIG.SCAN;
  return (
    AVAILABILITY === "everyone" ||
    (AVAILABILITY === "admins" && user.role === "admin")
  );
}

const DAY = 24 * 60 * 60 * 1000;

/** Reads a photo of a bill and suggests the transaction (nothing is saved:
 * the photo is attached through /attachments once the entry is). */
export const receiptsController = new Elysia({
  name: "receipts_controller",
  prefix: "/receipts",
})
  .use(protectedUser)
  .get("/config", ({ user }) =>
    ok({
      available: canScan(user),
      /** the server has Google credentials (shown on the admin page) */
      configured: documentAiService.configured,
    }),
  )
  .post(
    "/scan",
    async ({ user, body, status }) => {
      if (!canScan(user))
        return status(403, fail("Receipt scanning isn't available"));
      const { DAILY_LIMIT_PER_USER: limit } =
        systemConfigService.SYSTEM_CONFIG.SCAN;
      if (limit > 0 && rateLimitService.isOver(`scan:${user.id}`, limit))
        return status(
          429,
          fail(`You've scanned ${limit} receipts today. Try again tomorrow.`),
        );
      if (body.file.size > MAX_ATTACHMENT_BYTES)
        return status(413, fail("Photos can be up to 10 MB"));
      const data = new Uint8Array(await body.file.arrayBuffer());
      const type = sniffType(data);
      if (!type || !isImageType(type))
        return status(415, fail("Scan a JPG, PNG or WebP photo"));
      try {
        const scan = await scanReceipt(user.id, data, type);
        // Only scans that reached Google count towards the limit.
        if (limit > 0) rateLimitService.hit(`scan:${user.id}`, limit, DAY);
        return ok(
          scan,
          scan.words.length ? "Receipt read" : "No text found in that photo",
        );
      } catch (e) {
        if (e instanceof DocumentAiError)
          return status(e.retryable ? 503 : 502, fail(e.message));
        throw e;
      }
    },
    { body: t.Object({ file: t.File() }) },
  );
