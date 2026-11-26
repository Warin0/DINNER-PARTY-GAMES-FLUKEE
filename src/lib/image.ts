/**
 * Turn a photo from the host's device into a small JPEG data URL that fits in one realtime message
 * (the drawer's phone receives it privately; Ably's per-message limit is 64 KB).
 */
export async function fileToPicture(file: File, maxChars = 42_000): Promise<string> {
  const bmp = await load(file);
  const w0 = "width" in bmp ? bmp.width : (bmp as HTMLImageElement).naturalWidth;
  const h0 = "height" in bmp ? bmp.height : (bmp as HTMLImageElement).naturalHeight;
  if (!w0 || !h0) throw new Error("unreadable image");
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  for (const side of [480, 380, 300, 240]) {
    const k = Math.min(1, side / Math.max(w0, h0));
    c.width = Math.max(1, Math.round(w0 * k));
    c.height = Math.max(1, Math.round(h0 * k));
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp as CanvasImageSource, 0, 0, c.width, c.height);
    for (const q of [0.8, 0.68, 0.56, 0.45]) {
      const url = c.toDataURL("image/jpeg", q);
      if (url.length <= maxChars) return url;
    }
  }
  throw new Error("image too detailed to shrink");
}

async function load(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
