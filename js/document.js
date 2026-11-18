import { fitPixels } from "./core.js";

export function deviceProfile() {
  const mem = navigator.deviceMemory || 4;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const weak = mem <= 4 || (coarse && mem <= 6);
  let max = weak ? 1_800_000 : 7_000_000;
  if (ios) max = Math.min(max, 8_000_000);
  return { max, weak, undoLimit: weak ? 12 : 30, ios };
}

function makeLayer(w, h, name) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return {
    id: Math.random().toString(36).slice(2, 9),
    name,
    canvas,
    ctx,
    visible: true,
    opacity: 1,
    blend: "source-over",
    lockAlpha: false,
    clip: false,
    photo: false,
    photoScale: 1,
  };
}

export function createDocument(wMm, hMm, dpi) {
  const profile = deviceProfile();
  const fit = fitPixels(wMm, hMm, dpi, profile.max);
  const doc = {
    w: fit.w,
    h: fit.h,
    dpi: fit.dpi,
    wMm,
    hMm,
    reduced: fit.reduced,
    layers: [makeLayer(fit.w, fit.h, "طرح")],
    active: 0,
    undo: [],
    redo: [],
    undoLimit: profile.undoLimit,
    texts: [],
    scratch: null,
  };
  return doc;
}

export function activeLayer(doc) {
  return doc.layers[doc.active];
}

function scratch(doc) {
  if (!doc.scratch || doc.scratch.width !== doc.w || doc.scratch.height !== doc.h) {
    doc.scratch = document.createElement("canvas");
    doc.scratch.width = doc.w;
    doc.scratch.height = doc.h;
  }
  return doc.scratch;
}

export function renderView(doc, view, cam, opts = {}) {
  const ctx = view.getContext("2d");
  const z = cam.zoom * cam.dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, view.width, view.height);
  ctx.setTransform(z, 0, 0, z, -cam.panX * z, -cam.panY * z);
  if (!opts.transparent) {
    ctx.fillStyle = opts.paper || "#fff9f4";
    ctx.fillRect(0, 0, doc.w, doc.h);
  }
  if (opts.gamut) ctx.filter = "saturate(0.78)";
  for (let i = 0; i < doc.layers.length; i++) {
    const layer = doc.layers[i];
    if (!layer.visible) continue;
    if (layer.clip && i > 0) {
      const s = scratch(doc);
      const sx = s.getContext("2d");
      sx.setTransform(1, 0, 0, 1, 0, 0);
      sx.clearRect(0, 0, doc.w, doc.h);
      sx.globalAlpha = layer.opacity;
      sx.globalCompositeOperation = layer.blend || "source-over";
      sx.drawImage(layer.canvas, 0, 0);
      sx.globalAlpha = 1;
      sx.globalCompositeOperation = "destination-in";
      sx.drawImage(doc.layers[i - 1].canvas, 0, 0);
      ctx.drawImage(s, 0, 0);
    } else {
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = layer.blend || "source-over";
      ctx.drawImage(layer.canvas, 0, 0);
      ctx.restore();
    }
  }
  ctx.filter = "none";
}

export function flatten(doc, background) {
  const canvas = document.createElement("canvas");
  canvas.width = doc.w;
  canvas.height = doc.h;
  const ctx = canvas.getContext("2d");
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, doc.w, doc.h);
  }
  for (let i = 0; i < doc.layers.length; i++) {
    const layer = doc.layers[i];
    if (!layer.visible) continue;
    if (layer.clip && i > 0) {
      const s = scratch(doc);
      const sx = s.getContext("2d");
      sx.setTransform(1, 0, 0, 1, 0, 0);
      sx.clearRect(0, 0, doc.w, doc.h);
      sx.globalAlpha = layer.opacity;
      sx.drawImage(layer.canvas, 0, 0);
      sx.globalCompositeOperation = "destination-in";
      sx.drawImage(doc.layers[i - 1].canvas, 0, 0);
      ctx.drawImage(s, 0, 0);
    } else {
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = layer.blend || "source-over";
      ctx.drawImage(layer.canvas, 0, 0);
      ctx.restore();
    }
  }
  return canvas;
}

export function addLayer(doc, name) {
  if (doc.layers.length >= 20) return null;
  const layer = makeLayer(doc.w, doc.h, name || `لایه ${doc.layers.length + 1}`);
  doc.layers.splice(doc.active + 1, 0, layer);
  doc.active += 1;
  return layer;
}

export function deleteLayer(doc) {
  if (doc.layers.length <= 1) return;
  doc.layers.splice(doc.active, 1);
  doc.active = Math.max(0, doc.active - 1);
}

export function mergeDown(doc) {
  if (doc.active === 0) return;
  const upper = doc.layers[doc.active];
  const lower = doc.layers[doc.active - 1];
  lower.ctx.save();
  lower.ctx.globalAlpha = upper.opacity;
  lower.ctx.globalCompositeOperation = upper.blend || "source-over";
  lower.ctx.drawImage(upper.canvas, 0, 0);
  lower.ctx.restore();
  doc.layers.splice(doc.active, 1);
  doc.active -= 1;
}

export function moveLayer(doc, dir) {
  const next = doc.active + dir;
  if (next < 0 || next >= doc.layers.length) return;
  const [layer] = doc.layers.splice(doc.active, 1);
  doc.layers.splice(next, 0, layer);
  doc.active = next;
}

function blobOf(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else canvas.toBlob((png) => resolve(png), "image/png");
    }, "image/webp", 0.72);
  });
}

async function paintBlob(canvas, blob) {
  const bmp = await createImageBitmap(blob);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
}

export function snapshot(doc) {
  const layer = activeLayer(doc);
  const layerId = layer.id;
  const promise = blobOf(layer.canvas);
  const item = { layerId, promise, blob: null };
  promise.then((blob) => { item.blob = blob; });
  doc.undo.push(item);
  if (doc.undo.length > doc.undoLimit) doc.undo.shift();
  doc.redo = [];
}

export async function undo(doc) {
  const item = doc.undo.pop();
  if (!item) return false;
  const layer = doc.layers.find((l) => l.id === item.layerId);
  if (!layer) return false;
  const current = await blobOf(layer.canvas);
  doc.redo.push({ layerId: layer.id, blob: current });
  const blob = item.blob || await item.promise;
  if (blob) await paintBlob(layer.canvas, blob);
  return true;
}

export async function redo(doc) {
  const item = doc.redo.pop();
  if (!item) return false;
  const layer = doc.layers.find((l) => l.id === item.layerId);
  if (!layer) return false;
  const current = await blobOf(layer.canvas);
  const back = { layerId: layer.id, promise: Promise.resolve(current), blob: current };
  doc.undo.push(back);
  await paintBlob(layer.canvas, item.blob);
  return true;
}

export function resizeDocument(doc, wMm, hMm, dpi, mode) {
  const profile = deviceProfile();
  const fit = fitPixels(wMm, hMm, dpi, profile.max);
  const old = flatten(doc, null);
  doc.w = fit.w;
  doc.h = fit.h;
  doc.dpi = fit.dpi;
  doc.wMm = wMm;
  doc.hMm = hMm;
  doc.reduced = fit.reduced;
  doc.scratch = null;
  doc.undo = [];
  doc.redo = [];
  const layer = makeLayer(fit.w, fit.h, "طرح");
  if (mode !== "blank") {
    const scale = mode === "fill"
      ? Math.max(fit.w / old.width, fit.h / old.height)
      : Math.min(fit.w / old.width, fit.h / old.height);
    const dw = old.width * scale;
    const dh = old.height * scale;
    layer.ctx.drawImage(old, (fit.w - dw) / 2, (fit.h - dh) / 2, dw, dh);
    layer.photo = true;
    layer.photoScale = scale;
  }
  doc.layers = [layer];
  doc.active = 0;
  return fit;
}

export function replaceFromLayers(doc, layers) {
  doc.layers = layers;
  doc.active = layers.length - 1;
}

export async function layerFromBlob(blob, w, h, meta) {
  const layer = makeLayer(w, h, meta.name || "لایه");
  layer.visible = meta.visible !== false;
  layer.opacity = meta.opacity ?? 1;
  layer.blend = meta.blend || "source-over";
  layer.lockAlpha = !!meta.lockAlpha;
  layer.clip = !!meta.clip;
  if (blob) await paintBlob(layer.canvas, blob);
  return layer;
}

export function thumb(doc, size = 160) {
  const canvas = document.createElement("canvas");
  const scale = size / Math.max(doc.w, doc.h);
  canvas.width = Math.max(1, Math.round(doc.w * scale));
  canvas.height = Math.max(1, Math.round(doc.h * scale));
  const flat = flatten(doc, "#fff9f4");
  canvas.getContext("2d").drawImage(flat, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.7));
}

export function symmetryPoints(x, y, doc, mode) {
  const pts = [{ x, y }];
  if (!mode) return pts;
  if (mode === 1) {
    pts.push({ x: doc.w - x, y });
    return pts;
  }
  const cx = doc.w / 2;
  const cy = doc.h / 2;
  const ang = Math.atan2(y - cy, x - cx);
  const r = Math.hypot(x - cx, y - cy);
  for (let i = 1; i < mode; i++) {
    const a = ang + (Math.PI * 2 * i) / mode;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

export function tilePoints(x, y, doc, mode) {
  if (!mode || mode === "none") return [{ x, y, sx: 1 }];
  const out = [];
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      let ox = i * doc.w;
      const oy = j * doc.h;
      if (mode === "half" && Math.abs(j) % 2 === 1) ox += doc.w / 2;
      const flip = mode === "mirror" && (Math.abs(i) + Math.abs(j)) % 2 === 1;
      out.push({ x: flip ? doc.w - x + ox : x + ox, y: y + oy, sx: 1 });
    }
  }
  return out;
}
