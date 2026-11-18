import { homography, dominantColors } from "./core.js";

export function loadImageFile(file) {
  const bitmap = createImageBitmap ? createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null) : Promise.resolve(null);
  return bitmap.then((bmp) => {
    if (bmp) return drawBitmap(bmp);
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(drawBitmap(img));
      };
      img.onerror = () => reject(new Error("image"));
      img.src = url;
    });
  });
}

function drawBitmap(source) {
  const max = 1600;
  const scale = Math.min(1, max / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();
  return canvas;
}

function sample(src, sw, sh, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(sw - 1, x0 + 1);
  const y1 = Math.min(sh - 1, y0 + 1);
  if (x0 < 0 || y0 < 0 || x0 >= sw || y0 >= sh) return [0, 0, 0, 0];
  const dx = x - x0;
  const dy = y - y0;
  const i = (yy, xx) => (yy * sw + xx) * 4;
  const out = [0, 0, 0, 0];
  const p00 = i(y0, x0);
  const p10 = i(y0, x1);
  const p01 = i(y1, x0);
  const p11 = i(y1, x1);
  for (let c = 0; c < 4; c++) {
    const a = src[p00 + c] * (1 - dx) + src[p10 + c] * dx;
    const b = src[p01 + c] * (1 - dx) + src[p11 + c] * dx;
    out[c] = a * (1 - dy) + b * dy;
  }
  return out;
}

export function warpImage(source, corners, outW, outH) {
  const sw = source.width;
  const sh = source.height;
  const src = source.getContext("2d").getImageData(0, 0, sw, sh).data;
  const map = homography(
    [{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }],
    corners,
  );
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const img = canvas.getContext("2d").createImageData(outW, outH);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const p = map(x + 0.5, y + 0.5);
      const c = sample(src, sw, sh, p.x, p.y);
      const i = (y * outW + x) * 4;
      img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = c[3];
    }
  }
  canvas.getContext("2d").putImageData(img, 0, 0);
  return canvas;
}

export function autoLevels(canvas) {
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let min = 255; let max = 0;
  for (let i = 0; i < img.data.length; i += 16) {
    const y = img.data[i] * 0.3 + img.data[i + 1] * 0.5 + img.data[i + 2] * 0.2;
    min = Math.min(min, y); max = Math.max(max, y);
  }
  const span = Math.max(8, max - min);
  for (let i = 0; i < img.data.length; i += 4) {
    for (let c = 0; c < 3; c++) img.data[i + c] = Math.max(0, Math.min(255, (img.data[i + c] - min) * (255 / span)));
  }
  ctx.putImageData(img, 0, 0);
}

export function removePaper(canvas, threshold) {
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const corners = [[2, 2], [canvas.width - 3, 2], [2, canvas.height - 3], [canvas.width - 3, canvas.height - 3]];
  let pr = 0; let pg = 0; let pb = 0;
  for (const [x, y] of corners) {
    const i = (y * canvas.width + x) * 4;
    pr += img.data[i]; pg += img.data[i + 1]; pb += img.data[i + 2];
  }
  pr /= 4; pg /= 4; pb /= 4;
  const limit = threshold * 3;
  for (let i = 0; i < img.data.length; i += 4) {
    const d = Math.abs(img.data[i] - pr) + Math.abs(img.data[i + 1] - pg) + Math.abs(img.data[i + 2] - pb);
    if (d < limit) img.data[i + 3] = 0;
    else if (d < limit * 1.35) img.data[i + 3] = Math.round(255 * (d - limit) / (limit * 0.35));
  }
  ctx.putImageData(img, 0, 0);
}

export function traceLines(canvas, detail) {
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const edge = out.getContext("2d").createImageData(canvas.width, canvas.height);
  const w = canvas.width;
  const h = canvas.height;
  const lum = (x, y) => {
    const i = (y * w + x) * 4;
    return img.data[i] * 0.3 + img.data[i + 1] * 0.59 + img.data[i + 2] * 0.11;
  };
  const step = detail > 70 ? 2 : 1;
  const tol = 18 + (100 - detail);
  for (let y = step; y < h - step; y += step) {
    for (let x = step; x < w - step; x += step) {
      const g = Math.abs(lum(x, y) - lum(x + step, y)) + Math.abs(lum(x, y) - lum(x, y + step));
      if (g > tol) {
        const i = (y * w + x) * 4;
        edge.data[i] = 40; edge.data[i + 1] = 16; edge.data[i + 2] = 32; edge.data[i + 3] = 255;
      }
    }
  }
  out.getContext("2d").putImageData(edge, 0, 0);
  return out;
}

export function paletteFromCanvas(canvas, k) {
  const ctx = canvas.getContext("2d");
  const small = document.createElement("canvas");
  small.width = 48; small.height = 48;
  small.getContext("2d").drawImage(canvas, 0, 0, 48, 48);
  const data = small.getContext("2d").getImageData(0, 0, 48, 48).data;
  const pixels = [];
  for (let i = 0; i < data.length; i += 16) {
    if (data[i + 3] < 20) continue;
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  return dominantColors(pixels, k);
}

export function captureVideo(video) {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  canvas.getContext("2d").drawImage(video, 0, 0);
  return canvas;
}
