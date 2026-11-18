import test from "node:test";
import assert from "node:assert/strict";
import { fitPixels, homography, floodFill, dominantColors, dilateAlpha, packRects, hsvToRgb, rgbToHsv } from "../js/core.js";

test("fitPixels lowers dpi before exceeding the pixel budget", () => {
  const fit = fitPixels(297, 420, 300, 2_000_000);
  assert.ok(fit.w * fit.h <= 2_000_000);
  assert.ok(fit.reduced);
  assert.ok(fit.dpi < 300);
});

test("hsv roundtrip stays near the original hue", () => {
  const rgb = hsvToRgb(330, 0.6, 0.9);
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  assert.ok(Math.abs(hsv.h - 330) < 2);
});

test("homography maps a translated square", () => {
  const src = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const dst = [{ x: 10, y: 5 }, { x: 20, y: 5 }, { x: 20, y: 15 }, { x: 10, y: 15 }];
  const map = homography(src, dst);
  const p = map(0, 0);
  assert.ok(Math.abs(p.x - 10) < 0.01);
  assert.ok(Math.abs(p.y - 5) < 0.01);
  const q = map(1, 1);
  assert.ok(Math.abs(q.x - 20) < 0.01);
  assert.ok(Math.abs(q.y - 15) < 0.01);
});

test("flood fill stops at a wall and can close a one-pixel gap", () => {
  const w = 5; const h = 5;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
  }
  for (let y = 0; y < h; y++) {
    if (y === 2) continue;
    const i = (y * w + 2) * 4;
    data[i] = 0; data[i + 1] = 0; data[i + 2] = 0;
  }
  const filled = floodFill(data, w, h, 0, 0, [255, 0, 80, 255], 10, 1);
  assert.equal(filled[0], 255);
  assert.equal(filled[1], 0);
  const right = (0 * w + 4) * 4;
  assert.equal(filled[right], 255);
  assert.equal(filled[right + 1], 255);
});

test("k-means separates two obvious colors", () => {
  const pixels = [];
  for (let i = 0; i < 20; i++) pixels.push([10, 10, 200]);
  for (let i = 0; i < 20; i++) pixels.push([220, 20, 40]);
  const colors = dominantColors(pixels, 2);
  const blues = colors.filter((c) => c[2] > c[0]);
  const reds = colors.filter((c) => c[0] > c[2]);
  assert.equal(blues.length, 1);
  assert.equal(reds.length, 1);
});

test("dilate grows opaque pixels into a white margin", () => {
  const w = 5; const h = 5;
  const data = new Uint8ClampedArray(w * h * 4);
  const i = (2 * w + 2) * 4;
  data[i] = 20; data[i + 1] = 20; data[i + 2] = 20; data[i + 3] = 255;
  const out = dilateAlpha(data, w, h, 1);
  assert.equal(out[((2 * w + 3) * 4) + 3], 255);
  assert.equal(out[((2 * w + 3) * 4)], 255);
});

test("sticker packing keeps items inside the sheet width", () => {
  const packed = packRects([{ w: 40, h: 20 }, { w: 40, h: 30 }, { w: 30, h: 10 }], 70);
  for (const item of packed.items) assert.ok(item.x + item.w <= 70);
  assert.ok(packed.height >= 30);
});
