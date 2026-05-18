/**
 * Image compression helper — used to shrink body images so they fit
 * inline under Shopify's 1 MB body_html cap when uploading to Shopify
 * Files isn't available (no write_files scope) or when the publish
 * target doesn't support file hosting.
 *
 * Strategy:
 *   - Decode the data: URI into a Buffer
 *   - Resize to a max width (default 1024px) preserving aspect ratio
 *   - Re-encode as JPEG at the requested quality
 *   - If the result is still over the target size, retry with smaller
 *     dimensions and lower quality (one step), then give up
 *
 * Sharp is loaded via dynamic import so a failed install on a deploy
 * target doesn't crash the whole publish path — callers handle null
 * return as "compression unavailable, fall through to strip."
 */

export interface CompressOptions {
  /** Target byte ceiling for the compressed result. Default 600 KB. */
  maxBytes?: number;
  /** Max image width in pixels. Default 1024. */
  maxWidth?: number;
  /** JPEG quality 1-100. Default 72. */
  quality?: number;
}

/** Decode `data:image/...;base64,...` (or url-encoded) into bytes + mime. */
function decodeDataUri(
  dataUri: string,
): { mime: string; buffer: Buffer } | null {
  const match = dataUri.match(/^data:([^;,]+)(;base64)?,(.+)$/);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  if (!mime.startsWith("image/")) return null;
  const buffer = match[2]
    ? Buffer.from(match[3], "base64")
    : Buffer.from(decodeURIComponent(match[3]), "binary");
  return { mime, buffer };
}

function toDataUri(buffer: Buffer, mime: string): string {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

/**
 * Compress a data: URI image to fit under `maxBytes`.
 *
 * Returns:
 *   - new data: URI string on success
 *   - the original data URI if it already fits under maxBytes
 *   - null if sharp isn't installed, decode fails, or compression
 *     couldn't get under the ceiling
 */
export async function compressImageDataUri(
  dataUri: string,
  options: CompressOptions = {},
): Promise<string | null> {
  const maxBytes = options.maxBytes ?? 600 * 1024;
  const maxWidth = options.maxWidth ?? 1024;
  const quality = options.quality ?? 72;

  const decoded = decodeDataUri(dataUri);
  if (!decoded) return null;

  // Already small enough — no work needed.
  if (decoded.buffer.length <= maxBytes) {
    return dataUri;
  }

  // Dynamic import so sharp's absence doesn't break the calling module.
  // sharp ships native binaries that occasionally fail to install on
  // restricted Render plans / Windows file locks — when that happens,
  // returning null lets the caller fall back to stripping the image.
  let sharp: typeof import("sharp");
  try {
    sharp = (await import("sharp")).default as unknown as typeof import("sharp");
  } catch (err) {
    console.warn(
      "[image-compress] sharp is not available; skipping compression:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  try {
    // First pass: resize + JPEG re-encode at the requested quality.
    const firstPass = await sharp(decoded.buffer)
      .rotate() // honor EXIF orientation
      .resize({ width: maxWidth, withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (firstPass.length <= maxBytes) {
      return toDataUri(firstPass, "image/jpeg");
    }

    // Second pass: smaller + lower quality.
    const secondPass = await sharp(decoded.buffer)
      .rotate()
      .resize({ width: Math.round(maxWidth * 0.75), withoutEnlargement: true })
      .jpeg({ quality: Math.max(50, quality - 15), mozjpeg: true })
      .toBuffer();
    if (secondPass.length <= maxBytes) {
      return toDataUri(secondPass, "image/jpeg");
    }

    // Third pass: smaller still.
    const thirdPass = await sharp(decoded.buffer)
      .rotate()
      .resize({ width: 640, withoutEnlargement: true })
      .jpeg({ quality: 55, mozjpeg: true })
      .toBuffer();
    if (thirdPass.length <= maxBytes) {
      return toDataUri(thirdPass, "image/jpeg");
    }

    console.warn(
      `[image-compress] could not get under ${maxBytes} bytes (best: ${thirdPass.length})`,
    );
    return null;
  } catch (err) {
    console.warn(
      "[image-compress] sharp threw during compression:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
