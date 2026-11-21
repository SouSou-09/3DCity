import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const table = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  out.set(data, 8);
  out.writeUInt32BE(crc(out.subarray(4, data.length + 8)), data.length + 8);
  return out;
}

/** Writes RGBA pixels (row 0 at the top) as a PNG file. */
export function writePng(path: string, w: number, h: number, rgba: Uint8ClampedArray | Uint8Array): void {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let j = 0; j < h; j++) raw.set(rgba.subarray(j * w * 4, (j + 1) * w * 4), j * (w * 4 + 1) + 1);
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  head.set([8, 6, 0, 0, 0], 8);
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array(0))]));
}
