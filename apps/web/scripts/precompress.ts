/**
 * Writes `<file>.br` (Brotli 11) and `<file>.gz` (gzip 9) beside every
 * built JS/CSS asset. Prod nginx (`/etc/nginx/conf.d/tracker.conf`,
 * `location /assets/`) serves these as they are and labels every JS/CSS
 * response `br` for Brotli clients, so every asset must have its copies.
 * Nothing is compressed per request; Brotli is about 15% smaller than gzip.
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const dir = join(import.meta.dir, "../dist/assets");
let raw = 0;
let br = 0;
for (const name of await readdir(dir)) {
  if (!/\.(js|css)$/.test(name)) continue;
  const path = join(dir, name);
  const data = new Uint8Array(await Bun.file(path).arrayBuffer());
  const b = brotliCompressSync(data, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_SIZE_HINT]: data.length,
    },
  });
  await Bun.write(`${path}.br`, b);
  await Bun.write(`${path}.gz`, gzipSync(data, { level: 9 }));
  raw += data.length;
  br += b.length;
}
console.info(
  `precompressed assets: ${(raw / 1024).toFixed(0)} KB → ${(br / 1024).toFixed(0)} KB brotli`,
);
