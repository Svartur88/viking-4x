/**
 * Minimal indexed-PNG encoder (P2.B06).
 *
 * Why hand-rolled rather than a dependency: our terrain is already one byte per tile, and an
 * 8-bit palette PNG is one byte per pixel. The "encoding" is therefore a copy with a filter byte
 * per row, plus four short chunks. That is ~50 lines and no native build step on the host.
 *
 * Format: PNG signature, IHDR (colour type 3 = indexed), PLTE, IDAT (zlib), IEND.
 */
import { deflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/**
 * Encode an indexed image.
 * @param indices one byte per pixel, row-major, each an index into `palette`
 * @param palette up to 256 [r,g,b] triples
 * @param scale repeat each pixel `scale` times in both directions (nearest-neighbour)
 */
export function encodeIndexedPng(
  width: number, height: number, indices: Uint8Array | Buffer,
  palette: Array<[number, number, number]>, scale = 1,
): Buffer {
  if (indices.length < width * height) throw new Error("PNG_SHORT_PIXEL_DATA");
  if (palette.length === 0 || palette.length > 256) throw new Error("PNG_BAD_PALETTE");
  const w = width * scale, h = height * scale;

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 3;   // colour type: indexed
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace

  const plte = Buffer.alloc(palette.length * 3);
  palette.forEach(([r, g, b], i) => { plte[i * 3] = r; plte[i * 3 + 1] = g; plte[i * 3 + 2] = b; });

  // One filter byte (0 = None) then one index byte per pixel, per row.
  const raw = Buffer.alloc(h * (1 + w));
  for (let y = 0; y < height; y++) {
    const srcRow = y * width;
    const row = Buffer.alloc(w);
    for (let x = 0; x < width; x++) row.fill(indices[srcRow + x], x * scale, x * scale + scale);
    for (let s = 0; s < scale; s++) {
      const dst = (y * scale + s) * (1 + w);
      raw[dst] = 0;
      row.copy(raw, dst + 1);
    }
  }

  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("PLTE", plte),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
