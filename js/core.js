export function fitPixels(wMm, hMm, dpi, maxPixels) {
  let used = dpi;
  let w = Math.max(16, Math.round((wMm / 25.4) * used));
  let h = Math.max(16, Math.round((hMm / 25.4) * used));
  while (w * h > maxPixels && used > 72) {
    used = Math.max(72, Math.round(used * 0.85));
    w = Math.max(16, Math.round((wMm / 25.4) * used));
    h = Math.max(16, Math.round((hMm / 25.4) * used));
  }
  return { w, h, dpi: used, reduced: used < dpi };
}

export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

export function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

export function rgbToHex(r, g, b) {
  const p = (n) => n.toString(16).padStart(2, "0");
  return `#${p(r)}${p(g)}${p(b)}`;
}

function close(a, b, tolerance) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) + Math.abs(a[3] - b[3]) <= tolerance * 4;
}

export function floodFill(data, w, h, x, y, color, tolerance = 24, gap = 0) {
  const out = new Uint8ClampedArray(data);
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= w || y >= h) return out;
  const i0 = (y * w + x) * 4;
  const target = [out[i0], out[i0 + 1], out[i0 + 2], out[i0 + 3]];
  if (target[0] === color[0] && target[1] === color[1] && target[2] === color[2] && target[3] === color[3]) return out;
  const blocked = new Uint8Array(w * h);
  if (gap > 0) {
    const ink = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) {
      const i = p * 4;
      if (!close([out[i], out[i + 1], out[i + 2], out[i + 3]], target, tolerance)) ink[p] = 1;
    }
    const r = gap | 0;
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        let hit = 0;
        for (let dy = -r; dy <= r && !hit; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const nx = xx + dx; const ny = yy + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            if (ink[ny * w + nx]) { hit = 1; break; }
          }
        }
        if (hit) blocked[yy * w + xx] = 1;
      }
    }
    blocked[y * w + x] = 0;
  }
  const stack = [x, y];
  const seen = new Uint8Array(w * h);
  while (stack.length) {
    const cy = stack.pop();
    const cx = stack.pop();
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
    const p = cy * w + cx;
    if (seen[p] || blocked[p]) continue;
    const i = p * 4;
    if (!close([out[i], out[i + 1], out[i + 2], out[i + 3]], target, tolerance)) continue;
    seen[p] = 1;
    out[i] = color[0]; out[i + 1] = color[1]; out[i + 2] = color[2]; out[i + 3] = color[3];
    stack.push(cx - 1, cy, cx + 1, cy, cx, cy - 1, cx, cy + 1);
  }
  return out;
}

function solve(A, b) {
  const n = b.length;
  const m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const div = m[col][col] || 1e-12;
    for (let c = col; c <= n; c++) m[col][c] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col];
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row) => row[n]);
}

export function homography(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const X = dst[i].x;
    const Y = dst[i].y;
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]);
    b.push(Y);
  }
  const h = solve(A, b);
  return (x, y) => {
    const den = h[6] * x + h[7] * y + 1;
    return { x: (h[0] * x + h[1] * y + h[2]) / den, y: (h[3] * x + h[4] * y + h[5]) / den };
  };
}

export function dominantColors(pixels, k = 6) {
  if (!pixels.length) return [];
  const cents = [];
  for (let i = 0; i < k; i++) cents.push(pixels[Math.floor((i * pixels.length) / k)].slice());
  for (let iter = 0; iter < 8; iter++) {
    const groups = cents.map(() => []);
    for (const p of pixels) {
      let best = 0;
      let bd = Infinity;
      cents.forEach((c, i) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bd) { bd = d; best = i; }
      });
      groups[best].push(p);
    }
    groups.forEach((g, i) => {
      if (!g.length) return;
      cents[i] = [0, 1, 2].map((ch) => Math.round(g.reduce((s, p) => s + p[ch], 0) / g.length));
    });
  }
  return cents;
}

export function dilateAlpha(data, w, h, radius) {
  const out = new Uint8ClampedArray(data);
  const r = Math.max(1, radius | 0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let dy = -r; dy <= r && !a; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx; const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          if (dx * dx + dy * dy > r * r) continue;
          if (data[(yy * w + xx) * 4 + 3] > 16) { a = 255; break; }
        }
      }
      const i = (y * w + x) * 4;
      if (a && out[i + 3] < 250) {
        out[i] = 255; out[i + 1] = 255; out[i + 2] = 255; out[i + 3] = 255;
      }
    }
  }
  return out;
}

export function packRects(rects, sheetW) {
  const items = rects.map((r, i) => ({ ...r, i, x: 0, y: 0 }));
  items.sort((a, b) => b.h - a.h);
  let x = 0; let y = 0; let rowH = 0;
  for (const item of items) {
    if (x + item.w > sheetW) { x = 0; y += rowH; rowH = 0; }
    item.x = x; item.y = y;
    x += item.w;
    rowH = Math.max(rowH, item.h);
  }
  return { items, height: y + rowH };
}

export function colorName(h, s, v) {
  if (v < 0.12) return "مشکی";
  if (s < 0.08) return v > 0.9 ? "سفید" : "خاکستری";
  const names = ["قرمز", "نارنجی", "زرد", "سبز", "فیروزه‌ای", "آبی", "بنفش", "سرخابی"];
  return names[Math.round(h / 45) % 8];
}
