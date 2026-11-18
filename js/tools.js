import { floodFill, dilateAlpha } from "./core.js";

export function cssColor(color) {
  const a = color.a == null ? 1 : color.a;
  return `rgba(${color.r | 0},${color.g | 0},${color.b | 0},${a})`;
}

export function fillAt(layer, x, y, color, tolerance, gap) {
  const img = layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
  const out = floodFill(
    img.data,
    img.width,
    img.height,
    x,
    y,
    [color.r | 0, color.g | 0, color.b | 0, Math.round((color.a ?? 1) * 255)],
    tolerance,
    gap,
  );
  img.data.set(out);
  layer.ctx.putImageData(img, 0, 0);
}

export function smudgeAt(layer, x, y, size, angle) {
  const r = Math.max(2, size / 2);
  const sx = Math.round(x - r);
  const sy = Math.round(y - r);
  const w = Math.round(r * 2);
  const h = Math.round(r * 2);
  if (w < 1 || h < 1) return;
  const patch = document.createElement("canvas");
  patch.width = w;
  patch.height = h;
  patch.getContext("2d").drawImage(layer.canvas, sx, sy, w, h, 0, 0, w, h);
  layer.ctx.save();
  layer.ctx.globalAlpha = 0.55;
  layer.ctx.drawImage(patch, sx + Math.cos(angle) * 3, sy + Math.sin(angle) * 3);
  layer.ctx.restore();
}

export function eraseColorAt(layer, x, y, size, target, tolerance) {
  const r = Math.max(2, Math.round(size / 2));
  const sx = Math.max(0, Math.round(x - r));
  const sy = Math.max(0, Math.round(y - r));
  const ex = Math.min(layer.canvas.width, Math.round(x + r));
  const ey = Math.min(layer.canvas.height, Math.round(y + r));
  const w = ex - sx;
  const h = ey - sy;
  if (w < 1 || h < 1) return;
  const img = layer.ctx.getImageData(sx, sy, w, h);
  const tol = tolerance * 3;
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const dx = sx + xx - x;
      const dy = sy + yy - y;
      if (dx * dx + dy * dy > r * r) continue;
      const i = (yy * w + xx) * 4;
      const d = Math.abs(img.data[i] - target[0]) + Math.abs(img.data[i + 1] - target[1]) + Math.abs(img.data[i + 2] - target[2]);
      if (d <= tol) img.data[i + 3] = 0;
    }
  }
  layer.ctx.putImageData(img, sx, sy);
}

export function sampleColor(layer, x, y) {
  const px = layer.ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
  return { r: px[0], g: px[1], b: px[2], a: px[3] / 255 };
}

function box(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

export function drawShape(ctx, kind, a, b, color, filled, width) {
  const { x, y, w, h } = box(a, b);
  ctx.save();
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = cssColor(color);
  ctx.fillStyle = cssColor(color);
  ctx.beginPath();
  if (kind === "line") {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (kind === "rect") ctx.rect(x, y, w, h);
  else if (kind === "ellipse") ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2);
  else if (kind === "heart") heartPath(ctx, x + w / 2, y + h * 0.55, Math.max(w, h) / 2);
  else if (kind === "star") starPath(ctx, x + w / 2, y + h / 2, Math.min(w, h) / 2, 5);
  else polygonPath(ctx, x + w / 2, y + h / 2, Math.min(w, h) / 2, kind === "poly" ? 6 : 5);
  if (filled) ctx.fill();
  else ctx.stroke();
  ctx.restore();
}

function starPath(ctx, cx, cy, r, n) {
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 ? r * 0.42 : r;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function polygonPath(ctx, cx, cy, r, n) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function heartPath(ctx, cx, cy, s) {
  ctx.moveTo(cx, cy + s * 0.35);
  ctx.bezierCurveTo(cx + s * 0.1, cy, cx + s, cy - s * 0.5, cx, cy - s * 0.85);
  ctx.bezierCurveTo(cx - s, cy - s * 0.5, cx - s * 0.1, cy, cx, cy + s * 0.35);
  ctx.closePath();
}

export function drawGradient(ctx, kind, a, b, stops) {
  const colors = stops.length ? stops : ["#ff5f9a", "#d8a94b"];
  let g;
  if (kind === "radial") {
    const r = Math.max(4, Math.hypot(b.x - a.x, b.y - a.y));
    g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, r);
  } else if (kind === "conic" && ctx.createConicGradient) {
    g = ctx.createConicGradient(Math.atan2(b.y - a.y, b.x - a.x), a.x, a.y);
  } else {
    g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
  }
  colors.forEach((c, i) => g.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), c));
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

export function drawText(ctx, text, x, y, opt) {
  ctx.save();
  ctx.font = `${opt.bold ? 700 : 400} ${opt.size}px ${opt.family || "Vazirmatn"}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  if (opt.shadow) {
    ctx.shadowColor = "rgba(74,32,56,0.35)";
    ctx.shadowBlur = Math.max(4, opt.size * 0.12);
    ctx.shadowOffsetY = 2;
  }
  const run = (px, py, rot = 0) => {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    if (opt.stroke) {
      ctx.lineWidth = Math.max(2, opt.size * 0.08);
      ctx.strokeStyle = opt.stroke;
      ctx.strokeText(text, 0, 0);
    }
    ctx.fillStyle = opt.color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };
  if (opt.curve) {
    const r = Math.max(opt.size, text.length * opt.size * 0.28);
    for (let i = 0; i < text.length; i++) {
      const a = (i - (text.length - 1) / 2) * 0.28 - Math.PI / 2;
      run(x + Math.cos(a) * r, y + Math.sin(a) * r + r * 0.35, a + Math.PI / 2);
    }
  } else run(x, y);
  ctx.restore();
  const width = text.length * opt.size * 0.7;
  return { x: x - width / 2, y: y - opt.size / 2, w: width, h: opt.size };
}

export function adjustLayer(layer, opts) {
  const { brightness = 0, contrast = 0, saturation = 0, hue = 0, blur = 0, sharpen = 0, grain = 0 } = opts;
  const src = layer.canvas;
  const tmp = document.createElement("canvas");
  tmp.width = src.width;
  tmp.height = src.height;
  const tctx = tmp.getContext("2d");
  const filters = [];
  if (brightness) filters.push(`brightness(${1 + brightness})`);
  if (contrast) filters.push(`contrast(${1 + contrast})`);
  if (saturation) filters.push(`saturate(${1 + saturation})`);
  if (hue) filters.push(`hue-rotate(${hue}deg)`);
  if (blur) filters.push(`blur(${blur}px)`);
  tctx.filter = filters.join(" ") || "none";
  tctx.drawImage(src, 0, 0);
  if (sharpen > 0 || grain > 0) {
    const img = tctx.getImageData(0, 0, tmp.width, tmp.height);
    const copy = new Uint8ClampedArray(img.data);
    if (sharpen > 0) {
      const w = tmp.width;
      const h = tmp.height;
      const a = sharpen;
      for (let y = 1; y < h - 1; y += 1) {
        for (let x = 1; x < w - 1; x += 1) {
          const i = (y * w + x) * 4;
          for (let c = 0; c < 3; c++) {
            const v = copy[i + c] * (1 + 4 * a) - a * (copy[i - 4 + c] + copy[i + 4 + c] + copy[i - w * 4 + c] + copy[i + w * 4 + c]);
            img.data[i + c] = Math.max(0, Math.min(255, v));
          }
        }
      }
    }
    if (grain > 0) {
      for (let i = 0; i < img.data.length; i += 4) {
        const n = (Math.random() - 0.5) * grain * 80;
        img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
      }
    }
    tctx.putImageData(img, 0, 0);
  }
  layer.ctx.clearRect(0, 0, src.width, src.height);
  layer.ctx.drawImage(tmp, 0, 0);
}

export function liftRect(layer, x, y, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  canvas.getContext("2d").drawImage(layer.canvas, x, y, w, h, 0, 0, canvas.width, canvas.height);
  layer.ctx.clearRect(x, y, w, h);
  return { canvas, x, y, w: canvas.width, h: canvas.height, rot: 0, scale: 1 };
}

export function magicSelect(layer, x, y, tolerance) {
  const img = layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
  const before = new Uint8ClampedArray(img.data);
  const filled = floodFill(img.data, img.width, img.height, x, y, [0, 0, 0, 0], tolerance, 0);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const out = canvas.getContext("2d").createImageData(img.width, img.height);
  let minX = img.width; let minY = img.height; let maxX = 0; let maxY = 0; let any = false;
  for (let i = 0; i < filled.length; i += 4) {
    if (filled[i + 3] === 0 && before[i + 3] !== 0) {
      out.data[i] = before[i]; out.data[i + 1] = before[i + 1]; out.data[i + 2] = before[i + 2]; out.data[i + 3] = before[i + 3];
      img.data[i + 3] = 0;
      const p = i / 4;
      const px = p % img.width;
      const py = (p / img.width) | 0;
      minX = Math.min(minX, px); minY = Math.min(minY, py); maxX = Math.max(maxX, px); maxY = Math.max(maxY, py);
      any = true;
    } else {
      img.data[i] = before[i]; img.data[i + 1] = before[i + 1]; img.data[i + 2] = before[i + 2]; img.data[i + 3] = before[i + 3];
    }
  }
  if (!any) return null;
  layer.ctx.putImageData(img, 0, 0);
  canvas.getContext("2d").putImageData(out, 0, 0);
  const crop = document.createElement("canvas");
  crop.width = Math.max(1, maxX - minX + 1);
  crop.height = Math.max(1, maxY - minY + 1);
  crop.getContext("2d").drawImage(canvas, minX, minY, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return { canvas: crop, x: minX, y: minY, w: crop.width, h: crop.height, rot: 0, scale: 1 };
}

export function commitSelection(layer, sel) {
  layer.ctx.save();
  layer.ctx.translate(sel.x + sel.w / 2, sel.y + sel.h / 2);
  layer.ctx.rotate(sel.rot || 0);
  layer.ctx.scale(sel.scale || 1, sel.scale || 1);
  layer.ctx.drawImage(sel.canvas, -sel.w / 2, -sel.h / 2);
  layer.ctx.restore();
}

export function makeDieCut(source, radius) {
  const w = source.width;
  const h = source.height;
  const img = source.getContext("2d").getImageData(0, 0, w, h);
  const dilated = dilateAlpha(img.data, w, h, radius);
  const white = document.createElement("canvas");
  white.width = w; white.height = h;
  white.getContext("2d").putImageData(new ImageData(dilated, w, h), 0, 0);
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const o = out.getContext("2d");
  o.drawImage(white, 0, 0);
  o.drawImage(source, 0, 0);
  const cut = document.createElement("canvas");
  cut.width = w; cut.height = h;
  const edge = cut.getContext("2d").createImageData(w, h);
  const alphaAt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : dilated[(y * w + x) * 4 + 3]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = alphaAt(x, y);
      if (a < 128) continue;
      if (alphaAt(x - 1, y) < 128 || alphaAt(x + 1, y) < 128 || alphaAt(x, y - 1) < 128 || alphaAt(x, y + 1) < 128) {
        const i = (y * w + x) * 4;
        edge.data[i] = 255; edge.data[i + 1] = 0; edge.data[i + 2] = 255; edge.data[i + 3] = 255;
      }
    }
  }
  cut.getContext("2d").putImageData(edge, 0, 0);
  return { art: out, cut };
}

export function rotateAll(doc, turns) {
  const w = turns % 2 ? doc.h : doc.w;
  const h = turns % 2 ? doc.w : doc.h;
  for (const layer of doc.layers) {
    const next = document.createElement("canvas");
    next.width = w; next.height = h;
    const ctx = next.getContext("2d", { willReadFrequently: true });
    ctx.translate(w / 2, h / 2);
    ctx.rotate((Math.PI / 2) * turns);
    ctx.drawImage(layer.canvas, -layer.canvas.width / 2, -layer.canvas.height / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    layer.canvas = next;
    layer.ctx = ctx;
  }
  doc.w = w; doc.h = h;
  doc.scratch = null;
}

export function flipAll(doc) {
  for (const layer of doc.layers) {
    const next = document.createElement("canvas");
    next.width = doc.w; next.height = doc.h;
    const ctx = next.getContext("2d", { willReadFrequently: true });
    ctx.translate(doc.w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(layer.canvas, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    layer.canvas = next;
    layer.ctx = ctx;
  }
  doc.scratch = null;
}
