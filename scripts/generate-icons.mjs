import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

function createPng(width, height, drawFn) {
  // RGBA buffer
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = a;
    }
  }

  // Raw image data with scanline filter 0
  const rawData = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    rawData[y * (width * 4 + 1)] = 0; // Filter type 0 (None)
    rgba.copy(
      rawData,
      y * (width * 4 + 1) + 1,
      y * width * 4,
      (y + 1) * width * 4
    );
  }

  const deflated = zlib.deflateSync(rawData);

  // PNG header
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: 6 (RGBA)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const ihdrChunk = createChunk("IHDR", ihdr);
  const idatChunk = createChunk("IDAT", deflated);
  const iendChunk = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  const crc = crc32(typeAndData);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

// Chzzk Green: #00FFA3 (0, 255, 163)
// Dark Gray: #1F2026 (31, 32, 38)
const assetsDir = path.resolve("./com.chzzk.livestatus.sdPlugin/assets");
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

function drawChzzkIcon(x, y, w, h, mode = "single") {
  const cx = w / 2;
  const cy = h / 2;
  const radius = w * 0.45;
  const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);

  // Background rounded circle
  if (dist > radius) {
    return [0, 0, 0, 0]; // Transparent
  }

  // Dark background
  let [r, g, b, a] = [20, 22, 28, 255];

  // Draw stylish 'CHZZK' live symbol (Play triangle or double play)
  // Triangle pointing right
  const triW = w * 0.35;
  const triH = h * 0.4;
  const tx1 = cx - triW / 2;
  const ty1 = cy - triH / 2;
  const ty2 = cy + triH / 2;
  const tx2 = cx + triW / 2;

  // Simple point-in-triangle check
  if (x >= tx1 && x <= tx2) {
    const progress = (x - tx1) / triW;
    const minY = cy - (triH / 2) * (1 - progress);
    const maxY = cy + (triH / 2) * (1 - progress);
    if (y >= minY && y <= maxY) {
      // Chzzk neon green
      return [0, 255, 163, 255];
    }
  }

  // If multi-mode, draw a secondary layered icon / badge
  if (mode === "multi") {
    // Red/Green dot at top right
    const dotX = cx + radius * 0.55;
    const dotY = cy - radius * 0.55;
    const dotDist = Math.sqrt((x - dotX) ** 2 + (y - dotY) ** 2);
    if (dotDist <= radius * 0.3) {
      return [255, 59, 48, 255]; // Red live dot
    }
  }

  // Border ring
  if (dist >= radius - 2) {
    return [0, 255, 163, 180];
  }

  return [r, g, b, a];
}

const icons = [
  { name: "icon.png", size: 72, mode: "icon" },
  { name: "icon@2x.png", size: 144, mode: "icon" },
  { name: "action-single.png", size: 72, mode: "single" },
  { name: "action-single@2x.png", size: 144, mode: "single" },
  { name: "action-multi.png", size: 72, mode: "multi" },
  { name: "action-multi@2x.png", size: 144, mode: "multi" },
];

for (const icon of icons) {
  const buf = createPng(icon.size, icon.size, (x, y, w, h) =>
    drawChzzkIcon(x, y, w, h, icon.mode)
  );
  fs.writeFileSync(path.join(assetsDir, icon.name), buf);
  console.log(`Generated ${icon.name} (${icon.size}x${icon.size})`);
}
