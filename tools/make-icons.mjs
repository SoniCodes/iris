#!/usr/bin/env node
// draws the menu bar eyes as PNGs. node builtins only.
//   node tools/make-icons.mjs [--preview <dir>]
// geometry matches the SVG in app/renderer/index.html.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'assets', 'tray');

const GRID = 32;
const STROKE = 2;
const PUPIL_RADIUS = 3.2;

const SHAPES = {
  open: {
    curves: [
      [[5, 16], [16, 3], [27, 16]],
      [[27, 16], [16, 29], [5, 16]],
    ],
    pupil: [16, 16],
  },
  closed: {
    curves: [[[5, 13.5], [16, 26], [27, 13.5]]],
    pupil: null,
  },
};

function flatten([p0, c, p1], steps = 160) {
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const m = 1 - t;
    points.push([
      m * m * p0[0] + 2 * m * t * c[0] + t * t * p1[0],
      m * m * p0[1] + 2 * m * t * c[1] + t * t * p1[1],
    ]);
  }
  return points;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / lengthSquared, 0, 1);
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function coverage(shape, gx, gy, step, samples = 4) {
  const half = STROKE / 2;
  let hits = 0;

  for (let sy = 0; sy < samples; sy++) {
    for (let sx = 0; sx < samples; sx++) {
      const x = gx + ((sx + 0.5) / samples) * step;
      const y = gy + ((sy + 0.5) / samples) * step;

      if (shape.pupil && Math.hypot(x - shape.pupil[0], y - shape.pupil[1]) <= PUPIL_RADIUS) {
        hits++;
        continue;
      }

      let inside = false;
      for (const polyline of shape.polylines) {
        for (let i = 1; i < polyline.length && !inside; i++) {
          const a = polyline[i - 1];
          const b = polyline[i];
          if (distanceToSegment(x, y, a[0], a[1], b[0], b[1]) <= half) inside = true;
        }
        if (inside) break;
      }
      if (inside) hits++;
    }
  }

  return hits / (samples * samples);
}

function render(name, size, { onWhite = false } = {}) {
  // not .map(flatten): map would pass the index as steps
  const shape = { ...SHAPES[name], polylines: SHAPES[name].curves.map((curve) => flatten(curve)) };
  const step = GRID / size;
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const alpha = Math.round(coverage(shape, x * step, y * step, step) * 255);
      const offset = (y * size + x) * 4;
      if (onWhite) {
        const value = 255 - alpha;
        pixels[offset] = value;
        pixels[offset + 1] = value;
        pixels[offset + 2] = value;
        pixels[offset + 3] = 255;
      } else {
        pixels[offset + 3] = alpha;
      }
    }
  }

  return pixels;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBytes = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const start = y * (size * 4 + 1);
    raw[start] = 0;
    pixels.copy(raw, start + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const previewFlag = process.argv.indexOf('--preview');
const previewDir = previewFlag === -1 ? null : process.argv[previewFlag + 1];

mkdirSync(OUT_DIR, { recursive: true });

for (const name of ['closed', 'open']) {
  for (const [size, suffix] of [
    [16, ''],
    [32, '@2x'],
  ]) {
    const file = join(OUT_DIR, `eye-${name}Template${suffix}.png`);
    writeFileSync(file, encodePng(size, render(name, size)));
    console.log(`wrote ${file} (${size}x${size})`);
  }

  if (previewDir) {
    mkdirSync(previewDir, { recursive: true });
    const file = join(previewDir, `eye-${name}-preview.png`);
    writeFileSync(file, encodePng(160, render(name, 160, { onWhite: true })));
    console.log(`wrote ${file} (160x160 preview)`);
  }
}
