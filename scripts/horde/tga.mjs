import fs from "node:fs";

// Minimal reader for the uncompressed/RLE true-colour TGA files shipped with
// the Rocketbox avatars. Returns top-left origin RGBA pixels.
export function readTga(file) {
  const b = fs.readFileSync(file);
  const idLength = b[0],
    type = b[2],
    width = b.readUInt16LE(12),
    height = b.readUInt16LE(14),
    bpp = b[16],
    descriptor = b[17];
  if (type !== 2 && type !== 10) throw new Error(`${file}: TGA type ${type}`);
  if (bpp !== 24 && bpp !== 32) throw new Error(`${file}: ${bpp} bpp`);
  const size = bpp / 8,
    out = Buffer.alloc(width * height * 4),
    topLeft = (descriptor & 0x20) !== 0;
  let p = 18 + idLength,
    pixel = 0;
  const put = (src) => {
    const x = pixel % width,
      y = Math.floor(pixel / width),
      row = topLeft ? y : height - 1 - y,
      o = (row * width + x) * 4;
    out[o] = b[src + 2];
    out[o + 1] = b[src + 1];
    out[o + 2] = b[src];
    out[o + 3] = size === 4 ? b[src + 3] : 255;
    pixel++;
  };
  const total = width * height;
  if (type === 2) for (; pixel < total; p += size) put(p);
  else
    while (pixel < total) {
      const header = b[p++],
        count = (header & 0x7f) + 1;
      if (header & 0x80) {
        for (let i = 0; i < count; i++) put(p);
        p += size;
      } else for (let i = 0; i < count; i++, p += size) put(p);
    }
  return { width, height, data: out };
}
