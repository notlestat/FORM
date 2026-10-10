import { imageMime } from "./project.ts";

// Preflight encoded dimensions before asking the browser to allocate a decode.
// This is a bounds check, not a substitute for complete browser image validation.
export function imageBounds(bytes: Uint8Array): {
  width: number;
  height: number;
} {
  const mime = imageMime(bytes),
    v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0,
    height = 0;
  if (mime === "image/png") {
    if (
      bytes.length < 33 ||
      v.getUint32(8) !== 13 ||
      v.getUint32(12) !== 0x49484452
    )
      throw Error("Invalid PNG dimensions.");
    width = v.getUint32(16);
    height = v.getUint32(20);
  } else {
    let at = 2;
    while (at < bytes.length) {
      if (bytes[at++] !== 255) throw Error("Invalid JPEG segment.");
      while (bytes[at] === 255) at++;
      const marker = bytes[at++];
      if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (at + 2 > bytes.length) break;
      const length = v.getUint16(at);
      if (length < 2 || at + length > bytes.length)
        throw Error("Truncated JPEG segment.");
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker)
      ) {
        if (length < 8) throw Error("Invalid JPEG dimensions.");
        height = v.getUint16(at + 3);
        width = v.getUint16(at + 5);
        break;
      }
      at += length;
    }
  }
  if (
    width < 1 ||
    height < 1 ||
    Math.max(width, height) > 4096 ||
    width * height > 16e6
  )
    throw Error(
      "Photographs must fit within 4096px per edge and 16 megapixels.",
    );
  return { width, height };
}
