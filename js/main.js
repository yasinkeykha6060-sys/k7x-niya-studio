import { CONFIG } from "./config.js";
import { packRects } from "./core.js";
import { loadBrushes } from "./brushes.js";
import { loadFonts, loadPalettes, loadProducts } from "./products.js";
import { activeLayer, createDocument, deviceProfile, flatten, renderView, resizeDocument } from "./canvas.js";
import { addLayer, deleteLayer, layerFromBlob, mergeDown, moveLayer, redo, snapshot, thumb, undo } from "./layers.js";
import { symmetryPoints, tilePoints } from "./document.js";
import { beginStroke, clearStampCache, paintStamp, previewBrush, strokePoints } from "./brush-engine.js";
import { toRgb, fromHex, harmony, paintWheel, paintSquare, colorName, rgbToHex } from "./color.js";
import { docPoint, palmRejected, stabilize, snapValue } from "./input.js";
import { adjustLayer, commitSelection, drawGradient, drawShape, drawText, eraseColorAt, fillAt, flipAll, liftRect, magicSelect, makeDieCut, rotateAll, sampleColor, smudgeAt } from "./tools.js";
import { autoLevels, captureVideo, loadImageFile, paletteFromCanvas, removePaper, traceLines, warpImage } from "./scan.js";
import { flipCamera, openRearCamera, setTorch } from "./camera.js";
import { closeMug, drawMockup, openMug } from "./mockups.js";
import { downloadBlob, lookbookPdf, printPdf, shareOrSave, stampBrand } from "./export.js";
import { orderPdf, preflight } from "./print.js";
import { dataUrlToBlob, deleteProject, listProjects, loadProject, projectToJson, quotaRatio, rememberStorage, saveProject } from "./storage.js";
import { defaultBrand } from "./brand.js";
import { closeSheet, el, field, openSheet, toast } from "./ui.js";

const view = document.getElementById("view");
const overlay = document.getElementById("overlay");
const stage = document.getElementById("stage");
const fileInput = document.getElementById("file");
const backupInput = document.getElementById("backup-file");
const dpiNote = document.getElementById("dpi-note");
const fpsEl = document.getElementById("fps");

const profile = deviceProfile();
const state = {
  tool: "brush",
  brushes: [],
  brushId: "glass-dot",
  products: [],
  palettes: [],
  fonts: [],
  product: null,
  color: { h: 340, s: 0.72, v: 0.93, a: 1 },
  recent: JSON.parse(localStorage.getItem("niya-recent") || "[]"),
  favColors: JSON.parse(localStorage.getItem("niya-fav-colors") || "[]"),
  favBrushes: JSON.parse(localStorage.getItem("niya-fav-brushes") || "[\"glass-dot\"]"),
  recentBrushes: JSON.parse(localStorage.getItem("niya-recent-brushes") || "[]"),
  stabilizer: 0.35,
  straight: false,
  symmetry: 0,
  tile: "none",
  shape: "rect",
  shapeFill: false,
  gradientKind: "linear",
  stops: ["#ff5f9a", "#fff9f4", "#d8a94b"],
  tolerance: 36,
  gap: 1,
  grid: false,
  snap: true,
  ruler: false,
  showGuides: true,
  gamut: false,
  weak: profile.weak,
  customTip: null,
  selection: null,
  lasso: null,
  texts: [],
  stickers: [],
  collection: [],
  brand: defaultBrand(),
  projectId: crypto.randomUUID?.() || String(Date.now()),
  projectName: "کالکشن اول",
  doc: null,
  cam: { zoom: 1, panX: 0, panY: 0, dpr: 1 },
  tint: "#fff9f4",
  textOpt: { size: 64, family: "Vazirmatn", shadow: true, stroke: "#fff9f4", curve: false },
  cut: null,
  showFps: false,
};

let penAt = 0;
let gesture = null;
let spaceDown = false;
let pointers = new Map();
let pinch = null;
let stream = null;
let sheetCleanup = null;
let saveTimer = 0;

function rgb() { return toRgb(state.color); }
function brush() {
  if (state.brushId === "custom" && state.customTip) {
    return { id: "custom", name: "قلم از عکس", size: 36, opacity: 1, flow: 1, hardness: 1, spacing: 0.9, tip: "round", composite: "source-over", _lite: state.weak };
  }
  const found = state.brushes.find((item) => item.id === state.brushId) || state.brushes[0];
  return { ...found, _lite: state.weak, _lockAlpha: activeLayer(state.doc).lockAlpha };
}
function rememberBrush(id) {
  state.recentBrushes = [id, ...state.recentBrushes.filter((item) => item !== id)].slice(0, 6);
  localStorage.setItem("niya-recent-brushes", JSON.stringify(state.recentBrushes));
}
function rememberColor() {
  const hex = rgbToHex(rgb().r, rgb().g, rgb().b);
  state.recent = [hex, ...state.recent.filter((item) => item !== hex)].slice(0, 16);
  localStorage.setItem("niya-recent", JSON.stringify(state.recent));
}
function fullMm(product) {
  return { w: product.w + (product.bleed || 0) * 2, h: product.h + (product.bleed || 0) * 2 };
}
function shut() {
  sheetCleanup?.();
  sheetCleanup = null;
  closeMug();
  closeSheet();
}

function redraw() {
  renderView(state.doc, view, state.cam, { gamut: state.gamut });
  paintOverlay();
}
function paintOverlay(extra) {
  const ctx = overlay.getContext("2d");
  const z = state.cam.zoom * state.cam.dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  ctx.setTransform(z, 0, 0, z, -state.cam.panX * z, -state.cam.panY * z);
  ctx.lineWidth = 1 / state.cam.zoom;
  if (state.showGuides && state.product) {
    const bleed = ((state.product.bleed || 0) / 25.4) * state.doc.dpi;
    const safe = (((state.product.bleed || 0) + (state.product.safe || 0)) / 25.4) * state.doc.dpi;
    ctx.strokeStyle = "rgba(232,74,127,.85)";
    ctx.strokeRect(bleed, bleed, state.doc.w - bleed * 2, state.doc.h - bleed * 2);
    ctx.strokeStyle = "rgba(216,169,75,.95)";
    ctx.strokeRect(safe, safe, state.doc.w - safe * 2, state.doc.h - safe * 2);
  }
  if (state.grid) {
    const step = (10 / 25.4) * state.doc.dpi;
    ctx.strokeStyle = "rgba(74,32,56,.16)";
    for (let x = step; x < state.doc.w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, state.doc.h); ctx.stroke(); }
    for (let y = step; y < state.doc.h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(state.doc.w, y); ctx.stroke(); }
  }
  if (state.selection) {
    const sel = state.selection;
    ctx.save();
    ctx.translate(sel.x + (sel.w * sel.scale) / 2, sel.y + (sel.h * sel.scale) / 2);
    ctx.rotate(sel.rot || 0);
    ctx.drawImage(sel.canvas, (-sel.w * sel.scale) / 2, (-sel.h * sel.scale) / 2, sel.w * sel.scale, sel.h * sel.scale);
    ctx.restore();
    ctx.setLineDash([8 / state.cam.zoom, 6 / state.cam.zoom]);
    ctx.strokeStyle = "#e84a7f";
    ctx.strokeRect(sel.x, sel.y, sel.w * sel.scale, sel.h * sel.scale);
    ctx.setLineDash([]);
  }
  if (extra) extra(ctx);
}
function layout() {
  const rect = stage.getBoundingClientRect();
  const dpr = Math.min(state.weak ? 1.5 : 2, devicePixelRatio || 1);
  state.cam.dpr = dpr;
  view.width = overlay.width = Math.max(1, Math.round(rect.width * dpr));
  view.height = overlay.height = Math.max(1, Math.round(rect.height * dpr));
  redraw();
}
function fitView() {
  const rect = stage.getBoundingClientRect();
  if (rect.width < 20 || !state.doc) return;
  state.cam.zoom = Math.max(0.02, Math.min((rect.width - 24) / state.doc.w, (rect.height - 24) / state.doc.h));
  state.cam.panX = -((rect.width / state.cam.zoom) - state.doc.w) / 2;
  state.cam.panY = -((rect.height / state.cam.zoom) - state.doc.h) / 2;
  layout();
}
function updateNote() {
  const product = state.product;
  const soft = state.doc.reduced ? `برای روان ماندن، کیفیت ${state.doc.dpi} است` : `${state.doc.dpi} dpi`;
  dpiNote.textContent = `${product.name} · ${product.w}×${product.h} میلی‌متر · ${soft} · ابعاد را با چاپخانه تأیید کن`;
}
function guides() {
  const product = state.product;
  const dpi = state.doc.dpi;
  const bleed = ((product.bleed || 0) / 25.4) * dpi;
  const safe = (((product.bleed || 0) + (product.safe || 0)) / 25.4) * dpi;
  return [0, bleed, safe, state.doc.w / 2, state.doc.w - safe, state.doc.w - bleed, state.doc.w];
}
function pointOf(event) {
  const rect = view.getBoundingClientRect();
  let point = docPoint(event, rect, state.cam);
  if (state.snap && state.tool !== "pan") {
    const slack = 10 / state.cam.zoom;
    const lines = guides();
    point = { ...point, x: snapValue(point.x, lines, slack), y: snapValue(point.y, lines.map((n) => n * (state.doc.h / state.doc.w)), slack) };
    point.y = snapValue(point.y, [0, state.doc.h / 2, state.doc.h], slack);
  }
  return point;
}

function setTool(tool) {
  state.tool = tool;
  if (tool === "eraser" && !brush().eraser) state.brushId = "eraser-soft";
  if (tool === "brush" && brush().eraser) state.brushId = state.recentBrushes.find((id) => id !== "eraser-soft") || "glass-dot";
  document.querySelectorAll("[data-tool]").forEach((node) => node.classList.toggle("on", node.dataset.tool === tool));
  stage.dataset.tool = tool;
}

function fastPaint() {
  const layer = activeLayer(state.doc);
  return layer.opacity === 1 && layer.blend === "source-over" && !layer.clip && !layer.lockAlpha;
}

function paintGesture(points) {
  const layer = activeLayer(state.doc);
  const current = brush();
  if (current.tip === "nib" || current.tip === "flat") current.size *= 1 + (points[0]?.tilt || 0) * 0.65;
  if (current.special === "smudge" || current.special === "color-eraser") {
    for (const point of points) {
      if (current.special === "smudge") smudgeAt(layer, point.x, point.y, current.size, gesture.stroke.angle || 0);
      else eraseColorAt(layer, point.x, point.y, current.size, gesture.eraseTarget, state.tolerance);
    }
    redraw();
    return;
  }
  let color = rgb();
  if (current.mix) {
    const under = sampleColor(layer, points[0].x, points[0].y);
    if (under.a > 0.2) color = { r: color.r * 0.62 + under.r * 0.38, g: color.g * 0.62 + under.g * 0.38, b: color.b * 0.62 + under.b * 0.38, a: color.a };
  }
  const viewCtx = view.getContext("2d");
  const z = state.cam.zoom * state.cam.dpr;
  viewCtx.setTransform(z, 0, 0, z, -state.cam.panX * z, -state.cam.panY * z);
  const fast = fastPaint();
  strokePoints(layer.ctx, gesture.stroke, current, color, points, state.customTip, {
    onStamp(x, y) {
      if (fast) paintStamp(viewCtx, current, color, x, y, points[0].pressure, gesture.stroke.angle, state.customTip);
      for (const copy of symmetryPoints(x, y, state.doc, state.symmetry)) {
        for (const tile of tilePoints(copy.x, copy.y, state.doc, state.tile)) {
          if (Math.abs(tile.x - x) < 0.1 && Math.abs(tile.y - y) < 0.1) continue;
          paintStamp(layer.ctx, current, color, tile.x, tile.y, points[0].pressure, gesture.stroke.angle, state.customTip);
          if (fast) paintStamp(viewCtx, current, color, tile.x, tile.y, points[0].pressure, gesture.stroke.angle, state.customTip);
        }
      }
    },
  });
  if (!fast) redraw();
}

function pointerDown(event) {
  const palm = palmRejected(event, penAt);
  penAt = palm.penAt;
  if (palm.reject) return;
  try { overlay.setPointerCapture(event.pointerId); } catch { /* رویداد بدون قلم فعال */ }
  pointers.set(event.pointerId, event);
  if (pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    pinch = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2, zoom: state.cam.zoom, panX: state.cam.panX, panY: state.cam.panY };
    gesture = null;
    return;
  }
  const point = pointOf(event);
  if (state.tool === "eyedropper") { pick(point); return; }
  if (state.tool === "fill") { snapshot(state.doc); fillAt(activeLayer(state.doc), point.x, point.y, rgb(), state.tolerance, state.gap); redraw(); return; }
  if (state.tool === "magic") {
    snapshot(state.doc);
    state.selection = magicSelect(activeLayer(state.doc), point.x, point.y, state.tolerance);
    if (!state.selection) toast("این‌جا ناحیه‌ی پیوسته‌ای پیدا نشد.");
    redraw();
    return;
  }
  if (state.tool === "pan" || spaceDown) { gesture = { pan: true, x: event.clientX, y: event.clientY, panX: state.cam.panX, panY: state.cam.panY }; return; }
  if (state.selection && (state.tool === "select" || state.tool === "lasso" || state.tool === "magic")) {
    gesture = { moveSel: true, x: point.x, y: point.y, ox: state.selection.x, oy: state.selection.y };
    return;
  }
  if (state.tool === "select") {
    snapshot(state.doc);
    gesture = { selectRect: true, start: point };
    return;
  }
  snapshot(state.doc);
  const shaped = ["line", "rect", "ellipse", "heart", "star", "poly", "gradient"].includes(state.tool);
  gesture = { start: point, last: point, moved: false, shape: shaped, stroke: beginStroke(), smooth: null, eraseTarget: sampleColor(activeLayer(state.doc), point.x, point.y) };
  if (currentIsEraserColor()) gesture.eraseTarget = [gesture.eraseTarget.r, gesture.eraseTarget.g, gesture.eraseTarget.b];
  if (!shaped && state.tool !== "text") {
    gesture.timer = setTimeout(() => { if (gesture && !gesture.moved) gesture.shape = true; }, 520);
  }
  if (state.tool === "text") { gesture = null; askText(point); }
  if (state.tool === "lasso") gesture.lasso = [point];
}
function currentIsEraserColor() { return brush().special === "color-eraser"; }
function pointerMove(event) {
  if (pointers.has(event.pointerId)) pointers.set(event.pointerId, event);
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const midX = (a.clientX + b.clientX) / 2;
    const midY = (a.clientY + b.clientY) / 2;
    const rect = view.getBoundingClientRect();
    const before = docPoint({ clientX: pinch.x, clientY: pinch.y, pressure: 0.5 }, rect, state.cam);
    state.cam.zoom = Math.min(8, Math.max(0.04, pinch.zoom * (dist / pinch.dist)));
    const after = docPoint({ clientX: midX, clientY: midY, pressure: 0.5 }, rect, { ...state.cam });
    state.cam.panX = pinch.panX + before.x - after.x - (midX - pinch.x) / state.cam.zoom;
    state.cam.panY = pinch.panY + before.y - after.y - (midY - pinch.y) / state.cam.zoom;
    if (state.selection) state.selection.scale = Math.max(0.2, (state.selection.scale || 1) * (dist / pinch.dist));
    pinch = { ...pinch, dist, x: midX, y: midY, zoom: state.cam.zoom, panX: state.cam.panX, panY: state.cam.panY };
    redraw();
    return;
  }
  if (!gesture) return;
  if (gesture.pan) {
    state.cam.panX = gesture.panX - (event.clientX - gesture.x) / state.cam.zoom;
    state.cam.panY = gesture.panY - (event.clientY - gesture.y) / state.cam.zoom;
    redraw();
    return;
  }
  let point = pointOf(event);
  if (!gesture.shape) point = stabilize(gesture.smooth, point, state.stabilizer);
  gesture.smooth = point;
  if (gesture.start && Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) > 8) gesture.moved = true;
  if (gesture.selectRect) {
    paintOverlay((ctx) => drawShape(ctx, "rect", gesture.start, point, { r: 232, g: 74, b: 127, a: 1 }, false, 2));
    return;
  }
  if (gesture.moveSel && state.selection) {
    state.selection.x = gesture.ox + point.x - gesture.x;
    state.selection.y = gesture.oy + point.y - gesture.y;
    paintOverlay();
    return;
  }
  if (gesture.lasso) gesture.lasso.push(point);
  if (gesture.shape || state.straight) {
    paintOverlay((ctx) => {
      if (state.tool === "gradient" || gesture.gradient) drawGradientPreview(ctx, gesture.start, point);
      else if (gesture.lasso) {
        ctx.beginPath();
        gesture.lasso.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.strokeStyle = "#e84a7f";
        ctx.stroke();
      } else drawShape(ctx, gesture.shape ? (state.tool === "brush" || state.tool === "eraser" ? state.shape : state.tool) : "line", gesture.start, point, rgb(), state.shapeFill, brush().size);
    });
    const predicted = event.getPredictedEvents?.() || [];
    if (predicted.length && !gesture.shape) {
      paintOverlay((ctx) => {
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        predicted.forEach((item) => { const p = pointOf(item); ctx.lineTo(p.x, p.y); });
        ctx.strokeStyle = "rgba(232,74,127,.45)";
        ctx.stroke();
      });
    }
    return;
  }
  const coalesced = (event.getCoalescedEvents?.() || [event]).map((item) => {
    const raw = pointOf(item);
    return state.stabilizer ? { ...point, pressure: raw.pressure, tilt: raw.tilt } : raw;
  });
  paintGesture(coalesced.length ? coalesced : [point]);
  gesture.last = point;
}
function pointerUp(event) {
  pointers.delete(event.pointerId);
  if (pointers.size < 2) pinch = null;
  if (!gesture) return;
  clearTimeout(gesture.timer);
  const point = pointOf(event);
  if (gesture.pan || gesture.moveSel) { gesture = null; return; }
  if (gesture.selectRect) {
    const x = Math.min(gesture.start.x, point.x);
    const y = Math.min(gesture.start.y, point.y);
    const w = Math.abs(point.x - gesture.start.x);
    const h = Math.abs(point.y - gesture.start.y);
    if (w > 4 && h > 4) state.selection = liftRect(activeLayer(state.doc), x, y, w, h);
    gesture = null;
    redraw();
    return;
  }
  if (gesture.lasso && gesture.lasso.length > 3) finishLasso(gesture.lasso);
  else if (gesture.shape || state.straight) {
    const kind = state.straight ? "line" : (["line", "rect", "ellipse", "heart", "star", "poly"].includes(state.tool) ? state.tool : state.shape);
    if (state.tool === "gradient") drawGradient(activeLayer(state.doc).ctx, state.gradientKind, gesture.start, point, state.stops);
    else if (!gesture.moved) paintGesture([gesture.start]);
    else if (state.straight) paintGesture(linePoints(gesture.start, point));
    else drawShape(activeLayer(state.doc).ctx, kind, gesture.start, point, rgb(), state.shapeFill, brush().size);
    redraw();
  } else if (!gesture.moved) paintGesture([gesture.start]);
  gesture = null;
  rememberColor();
  scheduleSave();
}
function linePoints(a, b) {
  const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
  return Array.from({ length: n }, (_, i) => ({
    x: a.x + ((b.x - a.x) * i) / (n - 1),
    y: a.y + ((b.y - a.y) * i) / (n - 1),
    pressure: b.pressure,
    tilt: b.tilt,
  }));
}
function drawGradientPreview(ctx, a, b) {
  ctx.save();
  ctx.strokeStyle = "#e84a7f";
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}
function finishLasso(points) {
  const layer = activeLayer(state.doc);
  const mask = document.createElement("canvas");
  mask.width = state.doc.w; mask.height = state.doc.h;
  const ctx = mask.getContext("2d");
  ctx.drawImage(layer.canvas, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fill();
  layer.ctx.globalCompositeOperation = "destination-out";
  layer.ctx.beginPath();
  points.forEach((p, i) => (i ? layer.ctx.lineTo(p.x, p.y) : layer.ctx.moveTo(p.x, p.y)));
  layer.ctx.closePath();
  layer.ctx.fill();
  layer.ctx.globalCompositeOperation = "source-over";
  state.selection = { canvas: mask, x: 0, y: 0, w: mask.width, h: mask.height, rot: 0, scale: 1 };
  redraw();
}
function pick(point) {
  const flat = flatten(state.doc, null);
  const px = flat.getContext("2d").getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data;
  if (px[3] < 8) return;
  state.color = { ...fromHex(rgbToHex(px[0], px[1], px[2])), a: state.color.a };
  rememberColor();
  toast(colorName(state.color.h, state.color.s, state.color.v));
  mountPanels();
}
async function eyeDrop() {
  if (!window.EyeDropper) { toast("این مرورگر قطره‌چکان سیستم ندارد. روی بوم بزن."); setTool("eyedropper"); return; }
  try {
    const result = await new EyeDropper().open();
    state.color = { ...fromHex(result.sRGBHex), a: state.color.a };
    rememberColor();
    mountPanels();
  } catch { /* کاربر بسته */ }
}

function swatch(hex, onPick) {
  return el("button", { class: "swatch", style: `background:${hex}`, onclick: () => onPick(hex), "aria-label": hex });
}
function brushCard(item) {
  const preview = el("canvas", { width: "120", height: "36" });
  const star = state.favBrushes.includes(item.id) ? "★" : "☆";
  const card = el("button", { class: `brush${item.id === state.brushId ? " on" : ""}`, onclick: () => { state.brushId = item.id; state.tool = item.eraser ? "eraser" : "brush"; rememberBrush(item.id); setTool(state.tool); mountPanels(); } }, [
    preview,
    el("span", { text: item.name }),
    el("i", { class: "star", text: star, onclick: (event) => { event.stopPropagation(); toggleFavBrush(item.id); } }),
  ]);
  requestAnimationFrame(() => previewBrush(preview, item));
  return card;
}
function toggleFavBrush(id) {
  state.favBrushes = state.favBrushes.includes(id) ? state.favBrushes.filter((item) => item !== id) : [...state.favBrushes, id];
  localStorage.setItem("niya-fav-brushes", JSON.stringify(state.favBrushes));
  mountPanels();
}
function brushPanel() {
  const groups = [...new Set(state.brushes.map((item) => item.group))];
  const box = el("div", { class: "stack" });
  const current = brush();
  box.append(
    field("اندازه", range(1, 80, current.size, (value) => { const item = state.brushes.find((b) => b.id === state.brushId); if (item) item.size = value; clearStampCache(); })),
    field("تثبیت خط", range(0, 0.85, state.stabilizer, (value) => { state.stabilizer = value; }, 0.01)),
    el("label", { class: "check" }, [el("input", { type: "checkbox", checked: state.straight ? "true" : null, onchange: (e) => { state.straight = e.target.checked; } }), "خط مستقیم"]),
    el("p", { class: "hint", text: current.special === "foil" || current.special === "holo" || current.special === "glitter" ? CONFIG.foilNote : "همه‌ی قلم‌ها از اول بازند. ستاره یعنی موردعلاقه." }),
  );
  const favs = state.brushes.filter((item) => state.favBrushes.includes(item.id));
  if (favs.length) box.append(el("h3", { text: "موردعلاقه‌ها" }), el("div", { class: "brush-list" }, favs.map(brushCard)));
  for (const group of groups) {
    box.append(el("h3", { text: group }), el("div", { class: "brush-list" }, state.brushes.filter((item) => item.group === group).map(brushCard)));
  }
  box.append(el("button", { class: "ghost", onclick: () => fileInput.click(), text: "ساخت قلم از روی عکس" }));
  return box;
}
function range(min, max, value, oninput, step = 1) {
  const input = el("input", { type: "range", min, max, step, value });
  input.addEventListener("input", () => oninput(Number(input.value)));
  return input;
}
function colorPanel() {
  const color = rgb();
  const hex = rgbToHex(color.r, color.g, color.b);
  const wheel = el("canvas", { class: "wheel", width: "168", height: "168" });
  const square = el("canvas", { class: "sv", width: "168", height: "120" });
  const box = el("div", { class: "stack" }, [
    el("div", { class: "picker" }, [wheel, square]),
    el("p", { class: "color-name", text: `${colorName(state.color.h, state.color.s, state.color.v)} · ${hex}` }),
    field("شفافیت", range(0.05, 1, state.color.a, (value) => { state.color.a = value; }, 0.01)),
    field("روشنایی HSL", range(0, 100, Math.round(state.color.v * 100), (value) => { state.color.v = value / 100; })),
    el("div", { class: "row" }, [
      numField("R", color.r, (value) => setRgb({ r: value })),
      numField("G", color.g, (value) => setRgb({ g: value })),
      numField("B", color.b, (value) => setRgb({ b: value })),
    ]),
    hexField(hex),
    el("h3", { text: "اخیر" }),
    el("div", { class: "swatches" }, state.recent.map((item) => swatch(item, useHex))),
    el("h3", { text: "علاقه‌ها" }),
    el("div", { class: "swatches" }, state.favColors.map((item) => swatch(item, useHex))),
    el("button", { class: "ghost", text: "این رنگ را نگه دار", onclick: () => { state.favColors = [hex, ...state.favColors.filter((item) => item !== hex)].slice(0, 24); localStorage.setItem("niya-fav-colors", JSON.stringify(state.favColors)); mountPanels(); } }),
  ]);
  state.palettes.forEach((palette) => {
    box.append(el("h3", { text: palette.name }), el("div", { class: "swatches" }, palette.colors.map((item) => swatch(item, useHex))));
  });
  const harmonyRow = el("div", { class: "swatches" });
  [["مکمل", "complement"], ["سه‌گانه", "triad"], ["مشابه", "analog"], ["چهارگانه", "tetrad"]].forEach(([label, kind]) => {
    box.append(el("button", { class: "ghost", text: label, onclick: () => showHarmony(kind, harmonyRow) }));
  });
  box.append(harmonyRow);
  box.append(
    el("button", { class: "ghost", text: "قطره‌چکان سیستم", onclick: eyeDrop }),
    el("button", { class: "ghost", text: "پالت از عکس", onclick: () => { state.imageUse = "palette"; fileInput.click(); } }),
    el("p", { class: "hint", text: "رنگ صفحه با رنگ چاپ فرق دارد. اول یک نمونه‌ی کوچک بگیر." }),
    el("label", { class: "check" }, [el("input", { type: "checkbox", onchange: (e) => { state.gamut = e.target.checked; redraw(); } }), "پیش‌نمایش چاپ تقریبی"]),
    el("p", { class: "hint", text: CONFIG.foilNote }),
  );
  requestAnimationFrame(() => {
    paintWheel(wheel);
    paintSquare(square, state.color.h);
    bindWheel(wheel);
    bindSquare(square);
  });
  return box;
}
function setRgb(part) {
  const next = { ...rgb(), ...part };
  state.color = { ...fromHex(rgbToHex(next.r, next.g, next.b)), a: state.color.a };
  rememberColor();
  mountPanels();
}
function useHex(hex) {
  state.color = { ...fromHex(hex), a: state.color.a };
  rememberColor();
  mountPanels();
  redraw();
}
function numField(label, value, onchange) {
  const input = el("input", { type: "number", min: "0", max: "255", value: String(value | 0) });
  input.addEventListener("change", () => onchange(Number(input.value)));
  return field(label, input);
}
function hexField(hex) {
  const input = el("input", { type: "text", value: hex, dir: "ltr" });
  input.addEventListener("change", () => { if (/^#?[0-9a-f]{6}$/i.test(input.value)) useHex(input.value.startsWith("#") ? input.value : `#${input.value}`); });
  return field("HEX", input);
}
function bindWheel(canvas) {
  const move = (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    state.color.h = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    rememberColor();
    mountPanels();
  };
  canvas.addEventListener("pointerdown", (event) => { canvas.setPointerCapture(event.pointerId); move(event); });
  canvas.addEventListener("pointermove", (event) => { if (event.buttons) move(event); });
}
function bindSquare(canvas) {
  const move = (event) => {
    const rect = canvas.getBoundingClientRect();
    state.color.s = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    state.color.v = Math.min(1, Math.max(0, 1 - (event.clientY - rect.top) / rect.height));
    rememberColor();
    const name = document.querySelector(".color-name");
    if (name) name.textContent = `${colorName(state.color.h, state.color.s, state.color.v)} · ${rgbToHex(rgb().r, rgb().g, rgb().b)}`;
  };
  canvas.addEventListener("pointerdown", (event) => { canvas.setPointerCapture(event.pointerId); move(event); });
  canvas.addEventListener("pointermove", (event) => { if (event.buttons) move(event); });
}
function showHarmony(kind, host) {
  host.replaceChildren(...harmony(state.color.h, kind).map((hue) => {
    const col = hsvToSafe(hue);
    return swatch(rgbToHex(col.r, col.g, col.b), useHex);
  }));
}
function hsvToSafe(h) {
  return toRgb({ h, s: state.color.s, v: state.color.v, a: 1 });
}
function layerPanel() {
  const box = el("div", { class: "stack" });
  box.append(el("button", { class: "primary", text: "لایه‌ی تازه", onclick: () => { if (!addLayer(state.doc, "لایه")) toast("بیست لایه برای این طرح بس است."); mountPanels(); redraw(); } }));
  [...state.doc.layers].reverse().forEach((layer, indexFromTop) => {
    const index = state.doc.layers.length - 1 - indexFromTop;
    const row = el("div", { class: `layer${index === state.doc.active ? " on" : ""}` }, [
      el("button", { text: layer.visible ? "👁" : "–", onclick: () => { layer.visible = !layer.visible; redraw(); mountPanels(); } }),
      el("input", { value: layer.name, onchange: (e) => { layer.name = e.target.value; } }),
      el("button", { text: "انتخاب", onclick: () => { state.doc.active = index; mountPanels(); } }),
    ]);
    const blend = el("select");
    [["معمولی", "source-over"], ["ضرب", "multiply"], ["صفحه", "screen"], ["پوشش", "overlay"], ["رنگ", "color"], ["نرم", "soft-light"]].forEach(([label, value]) => {
      const option = el("option", { value, text: label });
      if (layer.blend === value) option.selected = true;
      blend.append(option);
    });
    blend.addEventListener("change", () => { layer.blend = blend.value; redraw(); });
    row.append(field("شفافیت", range(0.05, 1, layer.opacity, (value) => { layer.opacity = value; redraw(); }, 0.01)), blend);
    row.append(el("label", { class: "check" }, [checkbox(layer.lockAlpha, (v) => { layer.lockAlpha = v; }), "قفل شفافیت"]));
    row.append(el("label", { class: "check" }, [checkbox(layer.clip, (v) => { layer.clip = v; redraw(); }), "ماسک برش"]));
    box.append(row);
  });
  box.append(
    el("div", { class: "row" }, [
      el("button", { class: "ghost", text: "بالا", onclick: () => { moveLayer(state.doc, 1); mountPanels(); redraw(); } }),
      el("button", { class: "ghost", text: "پایین", onclick: () => { moveLayer(state.doc, -1); mountPanels(); redraw(); } }),
      el("button", { class: "ghost", text: "ادغام", onclick: () => { mergeDown(state.doc); mountPanels(); redraw(); } }),
      el("button", { class: "ghost", text: "حذف", onclick: () => { deleteLayer(state.doc); mountPanels(); redraw(); } }),
    ]),
    el("h3", { text: "تنظیم تصویر" }),
    filterSliders(),
  );
  return box;
}
function checkbox(checked, onchange) {
  const input = el("input", { type: "checkbox" });
  input.checked = !!checked;
  input.addEventListener("change", () => onchange(input.checked));
  return input;
}
function filterSliders() {
  const opts = { brightness: 0, contrast: 0, saturation: 0, hue: 0, blur: 0, sharpen: 0, grain: 0 };
  const box = el("div");
  [["روشنایی", "brightness", -0.4, 0.4], ["کنتراست", "contrast", -0.4, 0.4], ["اشباع", "saturation", -0.6, 0.8], ["رنگ‌مایه", "hue", -30, 30], ["محو", "blur", 0, 4], ["تیزی", "sharpen", 0, 0.6], ["دانه‌ی فیلم", "grain", 0, 0.8]].forEach(([label, key, min, max]) => {
    box.append(field(label, range(min, max, 0, (value) => { opts[key] = value; }, 0.01)));
  });
  box.append(el("button", { class: "primary", text: "اعمال فیلتر", onclick: () => { snapshot(state.doc); adjustLayer(activeLayer(state.doc), opts); redraw(); toast("فیلتر اعمال شد."); } }));
  return box;
}
function productPanel() {
  const box = el("div", { class: "stack" }, [el("p", { class: "warn", text: "ابعاد را با چاپخانه تأیید کن. عددها تقریبی‌اند و می‌توانی عوضشان کنی." })]);
  state.products.forEach((product) => {
    box.append(el("button", { class: `choice${state.product.id === product.id ? " on" : ""}`, text: `${product.name} · ${product.nameEn}`, onclick: () => { state.product = { ...product }; updateNote(); mountPanels(); } }));
  });
  const product = state.product;
  [["عرض mm", "w"], ["ارتفاع mm", "h"], ["حاشیه‌ی برش", "bleed"], ["ناحیه‌ی امن", "safe"], ["DPI", "dpi"]].forEach(([label, key]) => {
    const input = el("input", { type: "number", value: String(product[key] || 0) });
    input.addEventListener("change", () => { product[key] = Number(input.value); updateNote(); });
    box.append(field(label, input));
  });
  box.append(field("رنگ وسیله", colorInput(state.tint, (value) => { state.tint = value; })));
  box.append(el("div", { class: "row" }, [
    el("button", { class: "primary", text: "قالب این وسیله", onclick: () => applyTemplate("blank") }),
    el("button", { class: "ghost", text: "جا شدن", onclick: () => applyTemplate("fit") }),
    el("button", { class: "ghost", text: "پر شدن", onclick: () => applyTemplate("fill") }),
  ]));
  box.append(
    el("button", { class: "ghost", text: "ماکت همین وسیله", onclick: showMockup }),
    el("button", { class: "ghost", text: "اعمال روی همه", onclick: showAllMockups }),
    el("button", { class: "ghost", text: "دور برش استیکر", onclick: buildDieCut }),
    el("button", { class: "ghost", text: "افزودن به ورق استیکر", onclick: addSticker }),
    el("button", { class: "ghost", text: "چیدن ورق استیکر", onclick: packStickers }),
    el("label", { class: "check" }, [el("span", { text: "تکرار الگو" }), selectTile()]),
  );
  return box;
}
function colorInput(value, oninput) {
  const input = el("input", { type: "color", value });
  input.addEventListener("input", () => oninput(input.value));
  return input;
}
function selectTile() {
  const select = el("select");
  [["خاموش", "none"], ["ساده", "simple"], ["نیمه‌جابه‌جا", "half"], ["آینه‌ای", "mirror"]].forEach(([label, value]) => select.append(el("option", { value, text: label })));
  select.value = state.tile;
  select.addEventListener("change", () => { state.tile = select.value; });
  return select;
}
function applyTemplate(mode) {
  if (mode === "blank" && documentHasInk() && !confirm("قالب تازه طرح فعلی را جایگزین می‌کند. ادامه بدهم؟")) return;
  const size = fullMm(state.product);
  const fit = resizeDocument(state.doc, size.w, size.h, state.product.dpi || 150, mode);
  state.texts = [];
  state.cut = null;
  if (fit.reduced) toast("برای اینکه گوشی راحت کار کند کیفیت را کمی پایین آوردم. برای نمونه چاپ هنوز خوب است.");
  updateNote();
  fitView();
}
function documentHasInk() {
  if (state.doc.layers.length > 1) return true;
  const data = activeLayer(state.doc).ctx.getImageData(0, 0, state.doc.w, state.doc.h).data;
  for (let i = 3; i < data.length; i += 120) if (data[i] > 8) return true;
  return false;
}
function showMockup() {
  const art = flatten(state.doc, null);
  if (state.product.mockup === "mug") {
    const box = el("div", { class: "mug-box" });
    openSheet("ماکت لیوان", el("div", { class: "stack" }, [box, el("p", { class: "hint", text: "با انگشت بچرخان." })]));
    sheetCleanup = closeMug;
    requestAnimationFrame(() => openMug(box, art, state.tint).catch(() => toast("ماکت سه‌بعدی باز نشد.")));
    return;
  }
  const canvas = el("canvas", { width: "360", height: "280" });
  drawMockup(canvas, state.product, art, state.tint, "fit");
  openSheet(state.product.name, canvas);
}
function showAllMockups() {
  const art = flatten(state.doc, null);
  const grid = el("div", { class: "mock-grid" });
  state.products.forEach((product) => {
    const canvas = el("canvas", { width: "240", height: "180" });
    drawMockup(canvas, product, art, state.tint, "fit");
    canvas.addEventListener("click", () => { state.product = { ...product }; updateNote(); shut(); toast(`${product.name} انتخاب شد. قالب یا جاسازی را بزن.`); });
    grid.append(canvas);
  });
  openSheet("همه‌ی وسیله‌ها", grid);
}
function buildDieCut() {
  toast("دارم حاشیه‌ی سفید و خط برش را می‌سازم.");
  setTimeout(() => {
    const made = makeDieCut(flatten(state.doc, null), 8);
    state.cut = made.cut;
    const layer = addLayer(state.doc, "دور برش");
    if (layer) layer.ctx.drawImage(made.art, 0, 0, state.doc.w, state.doc.h);
    redraw();
    toast("خط برش سرخابی برای PDF آماده شد.");
  }, 40);
}
function addSticker() {
  const canvas = document.createElement("canvas");
  canvas.width = 280; canvas.height = 280;
  const art = flatten(state.doc, null);
  canvas.getContext("2d").drawImage(art, 0, 0, 280, 280);
  state.stickers.push(canvas);
  toast(`به ورق اضافه شد. الان ${state.stickers.length} طرح داری.`);
}
function packStickers() {
  if (!state.stickers.length) { toast("اول طرح را به ورق اضافه کن."); return; }
  const packed = packRects(state.stickers.map((canvas) => ({ w: canvas.width + 16, h: canvas.height + 16 })), 1000);
  const sheet = document.createElement("canvas");
  sheet.width = 1000;
  sheet.height = Math.max(200, packed.height);
  const ctx = sheet.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  packed.items.forEach((item) => ctx.drawImage(state.stickers[item.i], item.x + 8, item.y + 8));
  sheet.toBlob((blob) => shareOrSave(blob, "sticker-sheet.png", "ورق استیکر"));
}
function toolPanel() {
  return el("div", { class: "stack" }, [
    el("div", { class: "row" }, ["rect", "ellipse", "line", "heart", "star", "poly"].map((kind) => el("button", { class: state.shape === kind ? "primary" : "ghost", text: shapeLabel(kind), onclick: () => { state.shape = kind; setTool(kind); } }))),
    el("label", { class: "check" }, [checkbox(state.shapeFill, (v) => { state.shapeFill = v; }), "شکل پر شود"]),
    el("div", { class: "row" }, [
      el("button", { class: "ghost", text: "گرادیان خطی", onclick: () => { state.gradientKind = "linear"; setTool("gradient"); } }),
      el("button", { class: "ghost", text: "شعاعی", onclick: () => { state.gradientKind = "radial"; setTool("gradient"); } }),
      el("button", { class: "ghost", text: "زاویه‌ای", onclick: () => { state.gradientKind = "conic"; setTool("gradient"); } }),
    ]),
    field("ایستگاه ۱", colorInput(state.stops[0], (v) => { state.stops[0] = v; })),
    field("ایستگاه ۲", colorInput(state.stops[1], (v) => { state.stops[1] = v; })),
    field("ایستگاه ۳", colorInput(state.stops[2], (v) => { state.stops[2] = v; })),
    el("button", { class: "ghost", text: "متن", onclick: () => setTool("text") }),
    el("button", { class: "ghost", text: "انتخاب مستطیل", onclick: () => setTool("select") }),
    el("button", { class: "ghost", text: "لاسو", onclick: () => setTool("lasso") }),
    el("button", { class: "ghost", text: "عصای جادویی", onclick: () => setTool("magic") }),
    el("button", { class: "primary", text: "ثبت انتخاب", onclick: commitSel }),
    field("تحمل رنگ", range(0, 80, state.tolerance, (v) => { state.tolerance = v; })),
    field("بستن شکاف", range(0, 3, state.gap, (v) => { state.gap = v; })),
    field("تقارن", range(0, 16, state.symmetry, (v) => { state.symmetry = v; })),
    el("p", { class: "hint", text: "صفر خاموش است، یک آینه، و ۲ تا ۱۶ ماندالا. شکل را با نگه داشتن قلم هم می‌توانی بکشی." }),
    el("div", { class: "row" }, [
      el("button", { class: "ghost", text: "چرخش بوم", onclick: () => { rotateAll(state.doc, 1); fitView(); } }),
      el("button", { class: "ghost", text: "آینه", onclick: () => { flipAll(state.doc); redraw(); } }),
      el("button", { class: "ghost", text: state.grid ? "شبکه روشن" : "شبکه", onclick: () => { state.grid = !state.grid; redraw(); } }),
      el("button", { class: "ghost", text: state.showGuides ? "راهنما روشن" : "راهنما", onclick: () => { state.showGuides = !state.showGuides; redraw(); } }),
    ]),
  ]);
}
function shapeLabel(kind) {
  return { rect: "مستطیل", ellipse: "دایره", line: "خط", heart: "قلب", star: "ستاره", poly: "چندضلعی" }[kind];
}
function commitSel() {
  if (!state.selection) return;
  commitSelection(activeLayer(state.doc), state.selection);
  state.selection = null;
  redraw();
}
function askText(point) {
  const input = el("textarea", { rows: "3" });
  input.value = "نیایش";
  const size = el("input", { type: "number", value: String(state.textOpt.size) });
  const curve = checkbox(state.textOpt.curve, (v) => { state.textOpt.curve = v; });
  const shadow = checkbox(state.textOpt.shadow, (v) => { state.textOpt.shadow = v; });
  const family = el("select");
  state.fonts.forEach((font) => family.append(el("option", { value: font.family, text: font.name })));
  openSheet("متن", el("div", { class: "stack" }, [
    input, field("اندازه", size), field("فونت", family),
    el("label", { class: "check" }, [shadow, "سایه"]),
    el("label", { class: "check" }, [curve, "روی مسیر"]),
    el("button", { class: "primary", text: "بگذار روی طرح", onclick: () => {
      snapshot(state.doc);
      state.textOpt.size = Number(size.value) || 64;
      state.textOpt.family = family.value;
      const box = drawText(activeLayer(state.doc).ctx, input.value || "نیایش", point.x, point.y, { ...state.textOpt, color: `rgba(${rgb().r},${rgb().g},${rgb().b},${rgb().a})`, stroke: state.textOpt.stroke });
      state.texts.push(box);
      shut();
      redraw();
    } }),
  ]));
}
function menuPanel() {
  return el("div", { class: "stack" }, [
    el("button", { class: "choice", text: "پروژه‌ها", onclick: showProjects }),
    el("button", { class: "choice", text: "برند و امضا", onclick: showBrand }),
    el("button", { class: "choice", text: "دوربین و گالری", onclick: openCamera }),
    el("button", { class: "choice", text: "خروجی و چاپ", onclick: showExport }),
    el("button", { class: "choice", text: "کالکشن اول", onclick: showCollection }),
    el("button", { class: "choice", text: "راهنمای چاپخانه", onclick: showGuide }),
    el("button", { class: "choice", text: "تنظیمات", onclick: showSettings }),
    el("button", { class: "choice", text: "تمام‌صفحه", onclick: () => { document.body.classList.toggle("is-full"); shut(); layout(); } }),
  ]);
}
function showBrand() {
  const name = el("input", { value: state.brand.name });
  const en = el("input", { value: state.brand.nameEn, dir: "ltr" });
  const slogan = el("input", { value: state.brand.slogan });
  const logoText = el("input", { value: state.brand.logo.text });
  const sign = el("canvas", { class: "sign", width: "320", height: "140" });
  const ctx = sign.getContext("2d");
  let drawing = false;
  sign.addEventListener("pointerdown", (e) => { drawing = true; const p = local(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
  sign.addEventListener("pointermove", (e) => { if (!drawing) return; const p = local(e); ctx.lineTo(p.x, p.y); ctx.strokeStyle = "#4a2038"; ctx.lineWidth = 2.4; ctx.stroke(); });
  sign.addEventListener("pointerup", () => { drawing = false; });
  openSheet("برند", el("div", { class: "stack" }, [
    field("نام", name), field("نام انگلیسی", en), field("شعار", slogan), field("حرف لوگو", logoText),
    el("p", { class: "hint", text: "امضایت را با انگشت بکش." }), sign,
    el("label", { class: "check" }, [checkbox(state.brand.showLogo, (v) => { state.brand.showLogo = v; }), "لوگو روی فایل"]),
    el("label", { class: "check" }, [checkbox(state.brand.showSign, (v) => { state.brand.showSign = v; }), "امضا روی فایل"]),
    el("button", { class: "primary", text: "ذخیره‌ی برند", onclick: () => {
      state.brand.name = name.value; state.brand.nameEn = en.value; state.brand.slogan = slogan.value; state.brand.logo.text = logoText.value || "ن";
      state.brand.sign = sign; toast("برند ذخیره شد."); scheduleSave();
    } }),
  ]));
}
function local(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * event.currentTarget.width / rect.width, y: (event.clientY - rect.top) * event.currentTarget.height / rect.height };
}
async function openCamera() {
  const video = el("video");
  video.autoplay = true; video.playsInline = true; video.muted = true; video.setAttribute("playsinline", "");
  const grid = el("div", { class: "cam" }, [video, el("div", { class: "cam-grid" })]);
  const file = el("input", { type: "file", accept: "image/*", capture: "environment" });
  file.addEventListener("change", () => { if (file.files[0]) useFile(file.files[0]); });
  try {
    stream = await openRearCamera();
    video.srcObject = stream;
  } catch {
    toast("دوربین اجازه نداد. از گالری انتخاب کن، اشکالی ندارد.");
    file.click();
    return;
  }
  openSheet("دوربین", el("div", { class: "stack" }, [
    grid,
    el("div", { class: "row" }, [
      el("button", { class: "primary", text: "گرفتن", onclick: () => { const shot = captureVideo(video); stopCamera(); shut(); askImageUse(shot); } }),
      el("button", { class: "ghost", text: "چراغ", onclick: () => setTorch(stream, true).then((ok) => { if (!ok) toast("این دوربین چراغ نرم‌افزاری ندارد."); }).catch(() => toast("چراغ روشن نشد.")) }),
      el("button", { class: "ghost", text: "تعویض", onclick: async () => { try { stream = await flipCamera(stream); video.srcObject = stream; } catch { toast("دوربین عوض نشد."); } } }),
      el("button", { class: "ghost", text: "گالری", onclick: () => file.click() }),
    ]),
    el("p", { class: "hint", text: "عکس همین‌جا می‌ماند و جایی فرستاده نمی‌شود." }),
  ]));
  sheetCleanup = stopCamera;
}
function stopCamera() {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
}
function askImageUse(canvas) {
  openSheet("این عکس چه شود؟", el("div", { class: "stack" }, [
    el("button", { class: "choice", text: "لایه‌ی تازه", onclick: () => placeImage(canvas, "layer") }),
    el("button", { class: "choice", text: "مرجع نیمه‌شفاف", onclick: () => placeImage(canvas, "ref") }),
    el("button", { class: "choice", text: "پالت رنگ", onclick: () => makePalette(canvas) }),
    el("button", { class: "choice", text: "قلم از همین عکس", onclick: () => makeBrush(canvas) }),
    el("button", { class: "choice", text: "اسکن نقاشی", onclick: () => scanSheet(canvas) }),
    el("button", { class: "choice", text: "ردیاب خطوط", onclick: () => traceSheet(canvas) }),
  ]));
}
function placeImage(canvas, mode) {
  snapshot(state.doc);
  const layer = addLayer(state.doc, mode === "ref" ? "مرجع" : "عکس");
  if (!layer) { toast("جایی برای لایه‌ی تازه نماند."); return; }
  const scale = Math.min(state.doc.w / canvas.width, state.doc.h / canvas.height);
  const w = canvas.width * scale;
  const h = canvas.height * scale;
  layer.ctx.drawImage(canvas, (state.doc.w - w) / 2, (state.doc.h - h) / 2, w, h);
  layer.photo = true;
  layer.photoScale = scale < 1 ? 1 : canvas.width / state.doc.w;
  if (mode === "ref") layer.opacity = 0.4;
  shut();
  redraw();
}
function makePalette(canvas) {
  const colors = paletteFromCanvas(canvas, 8).map((item) => rgbToHex(item[0], item[1], item[2]));
  state.palettes.push({ id: `photo-${Date.now()}`, name: "از عکس", colors });
  shut();
  toast("پالت از عکس ساخته شد.");
  mountPanels();
}
function makeBrush(canvas) {
  const tip = document.createElement("canvas");
  tip.width = 96; tip.height = 96;
  tip.getContext("2d").drawImage(canvas, 0, 0, 96, 96);
  state.customTip = tip;
  state.brushId = "custom";
  setTool("brush");
  shut();
  toast("قلم تازه از روی عکس آماده است.");
}
function scanSheet(source) {
  const board = el("canvas");
  const maxW = Math.min(340, source.width);
  const scale = maxW / source.width;
  board.width = Math.round(source.width * scale);
  board.height = Math.round(source.height * scale);
  const corners = [[0.08, 0.08], [0.92, 0.08], [0.92, 0.92], [0.08, 0.92]].map(([x, y]) => ({ x: x * board.width, y: y * board.height }));
  let drag = -1;
  const paint = () => {
    const ctx = board.getContext("2d");
    ctx.drawImage(source, 0, 0, board.width, board.height);
    ctx.beginPath();
    corners.forEach((corner, index) => (index ? ctx.lineTo(corner.x, corner.y) : ctx.moveTo(corner.x, corner.y)));
    ctx.closePath();
    ctx.strokeStyle = "#e84a7f";
    ctx.lineWidth = 2;
    ctx.stroke();
    corners.forEach((corner) => { ctx.fillStyle = "#d8a94b"; ctx.beginPath(); ctx.arc(corner.x, corner.y, 7, 0, 7); ctx.fill(); });
  };
  paint();
  board.addEventListener("pointerdown", (event) => {
    const p = local(event);
    drag = corners.findIndex((corner) => Math.hypot(corner.x - p.x, corner.y - p.y) < 24);
  });
  board.addEventListener("pointermove", (event) => {
    if (drag < 0) return;
    const p = local(event);
    corners[drag].x = Math.max(0, Math.min(board.width, p.x));
    corners[drag].y = Math.max(0, Math.min(board.height, p.y));
    paint();
  });
  board.addEventListener("pointerup", () => { drag = -1; });
  const threshold = range(10, 140, 55, () => {});
  openSheet("اسکن نقاشی", el("div", { class: "stack" }, [
    board,
    field("حذف زمینه‌ی کاغذ", threshold),
    el("p", { class: "hint", text: "چهار گوشه را روی لبه‌ی نقاشی بگذار. نتیجه به عکس بستگی دارد و می‌توانی دوباره تنظیم کنی." }),
    el("button", { class: "primary", text: "صاف کن و بیاور", onclick: async () => {
      toast("دارم کاغذ را صاف می‌کنم…");
      await new Promise((resolve) => setTimeout(resolve, 30));
      const sx = source.width / board.width;
      const sy = source.height / board.height;
      const mapped = corners.map((corner) => ({ x: corner.x * sx, y: corner.y * sy }));
      const outW = Math.min(900, source.width);
      const outH = Math.max(1, Math.round(outW * (source.height / source.width)));
      const warped = warpImage(source, mapped, outW, outH);
      autoLevels(warped);
      removePaper(warped, Number(threshold.value));
      placeImage(warped, "layer");
    } }),
  ]));
}
function traceSheet(source) {
  const detail = range(10, 100, 55, () => {});
  openSheet("ردیاب", el("div", { class: "stack" }, [
    field("جزئیات", detail),
    el("button", { class: "primary", text: "خط‌ها را جدا کن", onclick: () => {
      const lines = traceLines(source, Number(detail.value));
      placeImage(lines, "layer");
      toast("خط‌ها روی لایه‌ی تازه آمدند. با سطل رنگ پرشان کن.");
    } }),
  ]));
}
function exportCanvas(background) {
  const canvas = flatten(state.doc, background);
  if (state.brand.showLogo || state.brand.showSign) stampBrand(canvas, state.brand);
  return canvas;
}
function showExport() {
  const warns = preflight(state.doc, state.product, state.texts);
  const list = el("ul", { class: "warns" }, warns.length ? warns.map((item) => el("li", { text: item })) : [el("li", { text: "بررسی اولیه چیزی که جلوی چاپ را بگیرد ندید." })]);
  const qty = el("input", { type: "number", value: "1", min: "1" });
  const note = el("textarea", { rows: "3", placeholder: "یادداشت برای چاپخانه" });
  openSheet("خروجی", el("div", { class: "stack" }, [
    el("h3", { text: "بررسی قبل از چاپ" }), list,
    el("button", { class: "primary", text: "PNG شفاف", onclick: () => saveCanvas(exportCanvas(null), "niyayesh.png") }),
    el("button", { class: "ghost", text: "PNG با زمینه", onclick: () => saveCanvas(exportCanvas("#fff9f4"), "niyayesh-paper.png") }),
    el("button", { class: "ghost", text: "PDF آماده‌ی چاپ", onclick: savePdf }),
    el("button", { class: "ghost", text: "PNG ماکت", onclick: saveMockup }),
    field("تعداد", qty), note,
    el("button", { class: "ghost", text: "برگه‌ی سفارش", onclick: () => saveOrder(qty.value, note.value) }),
    el("p", { class: "hint", text: CONFIG.printNote }),
  ]));
}
function saveCanvas(canvas, name) {
  canvas.toBlob((blob) => shareOrSave(blob, name, state.brand.name).then((mode) => { if (mode === "saved") toast("فایل دانلود شد."); }).catch(() => toast("اشتراک باز نشد. فایل را دانلود کردم.")));
}
async function savePdf() {
  try {
    const bytes = await printPdf(state.doc, state.product, state.product.diecut ? state.cut : null);
    await shareOrSave(new Blob([bytes], { type: "application/pdf" }), `${state.product.id}.pdf`, state.brand.name);
  } catch {
    toast("ساخت PDF ممکن نشد. PNG را بده به چاپخانه.");
  }
}
function saveMockup() {
  const canvas = el("canvas", { width: "900", height: "700" });
  drawMockup(canvas, state.product, flatten(state.doc, null), state.tint, "fit");
  saveCanvas(canvas, `${state.product.id}-mockup.png`);
}
async function saveOrder(qty, note) {
  const lines = [
    `محصول: ${state.product.name} / ${state.product.nameEn}`,
    `ابعاد برش: ${state.product.w} × ${state.product.h} میلی‌متر`,
    `حاشیه برش: ${state.product.bleed || 0} میلی‌متر`,
    `فایل: ${state.product.id}.png و ${state.product.id}.pdf`,
    `تعداد: ${qty || 1}`,
    `رزولوشن فایل: ${state.doc.dpi} dpi`,
  ];
  try {
    const bytes = await orderPdf(lines, `${note || ""} ${CONFIG.printNote}`);
    downloadBlob(new Blob([bytes], { type: "application/pdf" }), "order.pdf");
  } catch {
    toast("برگه‌ی سفارش ساخته نشد.");
  }
}
function showGuide() {
  openSheet("با چاپخانه", el("div", { class: "stack prose" }, [
    el("p", { text: "فایل PNG شفاف یا PDF همین استودیو را بفرست. برای لیوان فایل دورتا دور است. برای استیکر خط سرخابی دور برش را نشان بده و بگو کات‌کانتور است." }),
    el("p", { text: "ابعاد را قبل از چاپ نهایی با خودشان چک کن. اول یک نمونه‌ی کوچک بگیر. رنگ صفحه با مرکب چاپ یکی نیست و فویل و هولوگرام در چاپ معمولی فقط شبیه‌اند." }),
    el("p", { text: "این استودیو سفارش را نمی‌فرستد و قیمت یا زمان نمی‌دهد. فقط فایل را آماده می‌کند." }),
  ]));
}
function showCollection() {
  const box = el("div", { class: "stack" });
  box.append(el("button", { class: "primary", text: "این طرح را به کالکشن اضافه کن", onclick: () => {
    state.collection.push({ name: state.projectName, product: state.product.name, date: new Date().toLocaleDateString("fa-IR"), canvas: exportCanvas("#fff9f4") });
    toast("به کالکشن اول اضافه شد.");
    showCollection();
  } }));
  state.collection.forEach((item) => box.append(el("p", { text: `${item.name} · ${item.product} · ${item.date}` })));
  box.append(el("button", { class: "ghost", text: "لوک‌بوک PNG و PDF", onclick: exportLookbook }));
  openSheet("کالکشن اول", box);
}
async function exportLookbook() {
  if (!state.collection.length) state.collection.push({ name: state.projectName, product: state.product.name, date: new Date().toLocaleDateString("fa-IR"), canvas: exportCanvas("#fff9f4") });
  await document.fonts.load("700 48px Vazirmatn");
  const page = document.createElement("canvas");
  page.width = 1240; page.height = 1754;
  const ctx = page.getContext("2d");
  ctx.fillStyle = "#fff9f4";
  ctx.fillRect(0, 0, page.width, page.height);
  ctx.fillStyle = "#4a2038";
  ctx.textAlign = "center";
  ctx.font = "700 54px Vazirmatn";
  ctx.fillText(state.brand.name, 620, 90);
  ctx.font = "400 28px Vazirmatn";
  ctx.fillStyle = "#b83266";
  ctx.fillText(state.brand.slogan, 620, 140);
  state.collection.slice(0, 4).forEach((item, index) => {
    const x = 80 + (index % 2) * 560;
    const y = 200 + Math.floor(index / 2) * 720;
    ctx.drawImage(item.canvas, x, y, 500, 560);
    ctx.fillStyle = "#4a2038";
    ctx.font = "400 24px Vazirmatn";
    ctx.fillText(`${item.product} · ${item.date}`, x + 250, y + 610);
  });
  if (state.brand.showSign && state.brand.sign) ctx.drawImage(state.brand.sign, 80, 1600, 280, 100);
  saveCanvas(page, "lookbook.png");
  try {
    const bytes = await lookbookPdf([page]);
    downloadBlob(new Blob([bytes], { type: "application/pdf" }), "lookbook.pdf");
  } catch { /* PNG کافی است */ }
}
async function showProjects() {
  let records = [];
  try { records = await listProjects(); } catch { toast("فهرست پروژه‌ها باز نشد."); return; }
  const box = el("div", { class: "stack" });
  box.append(el("button", { class: "primary", text: "پروژه‌ی تازه", onclick: () => { state.projectId = crypto.randomUUID?.() || String(Date.now()); state.projectName = "طرح تازه"; applyTemplate("blank"); shut(); } }));
  records.forEach((record) => {
    box.append(el("div", { class: "layer" }, [
      el("strong", { text: record.name }),
      el("button", { class: "ghost", text: "باز کردن", onclick: () => restore(record.id) }),
      el("button", { class: "ghost", text: "کپی", onclick: () => copyProject(record) }),
      el("button", { class: "ghost", text: "نام", onclick: async () => { const name = prompt("نام تازه", record.name); if (!name) return; record.name = name; await saveProject(record); showProjects(); } }),
      el("button", { class: "ghost", text: "حذف", onclick: async () => { if (!confirm("این پروژه پاک شود؟")) return; await deleteProject(record.id); showProjects(); } }),
    ]));
  });
  openSheet("پروژه‌ها", box);
}
async function copyProject(record) {
  const copy = { ...record, id: crypto.randomUUID?.() || String(Date.now()), name: `${record.name} کپی`, updated: Date.now() };
  await saveProject(copy);
  toast("کپی ساخته شد.");
  showProjects();
}
async function restore(id) {
  const record = await loadProject(id);
  if (!record) return;
  state.projectId = record.id;
  state.projectName = record.name;
  state.product = state.products.find((item) => item.id === record.productId) || state.product;
  state.doc = createDocument(record.wMm, record.hMm, record.dpi);
  state.doc.w = record.w; state.doc.h = record.h; state.doc.dpi = record.dpi;
  const layers = [];
  for (const layer of record.layers) layers.push(await layerFromBlob(layer.blob, record.w, record.h, layer));
  state.doc.layers = layers.length ? layers : state.doc.layers;
  state.doc.active = state.doc.layers.length - 1;
  if (record.brand) state.brand = { ...defaultBrand(), ...record.brand };
  if (typeof state.brand.sign === "string") {
    const image = new Image();
    image.src = state.brand.sign;
    state.brand.sign = image;
  }
  localStorage.setItem("niya-last", id);
  shut();
  updateNote();
  fitView();
  toast("پروژه برگشت.");
}
function showSettings() {
  const test = el("canvas", { width: "280", height: "48" });
  openSheet("تنظیمات", el("div", { class: "stack" }, [
    el("button", { class: "ghost", text: state.showFps ? "بستن FPS" : "گزارش FPS", onclick: () => { state.showFps = !state.showFps; fpsEl.hidden = !state.showFps; shut(); } }),
    el("p", { class: "hint", text: state.weak ? "حالت سبک روشن است تا قلم روی این دستگاه روان بماند." : "دستگاه توان حالت کامل‌تر را دارد." }),
    el("button", { class: "primary", text: "پشتیبان JSON", onclick: exportBackup }),
    el("button", { class: "ghost", text: "برگرداندن پشتیبان", onclick: () => backupInput.click() }),
    el("p", { class: "hint", text: CONFIG.backupNote }),
    test,
  ]));
  requestAnimationFrame(async () => {
    await document.fonts.load("20px Vazirmatn");
    const ctx = test.getContext("2d");
    ctx.fillStyle = "#4a2038";
    ctx.font = "20px Vazirmatn";
    ctx.fillText("پ چ ژ گ ک ی ۰۹ نیم‌فاصله", 8, 30);
  });
}
async function exportBackup() {
  await persist();
  const records = await listProjects();
  const payload = [];
  for (const record of records) payload.push(JSON.parse(await projectToJson(record)));
  downloadBlob(new Blob([JSON.stringify(payload)], { type: "application/json" }), "niyayesh-backup.json");
  toast("پشتیبان دانلود شد. جایی امن نگه‌اش دار.");
}
async function importBackup(file) {
  try {
    const payload = JSON.parse(await file.text());
    const records = [].concat(payload);
    for (const record of records) {
      record.layers = (record.layers || []).map((layer) => ({ ...layer, blob: typeof layer.blob === "string" ? dataUrlToBlob(layer.blob) : layer.blob }));
      await saveProject(record);
    }
    toast("پشتیبان برگشت. از فهرست پروژه‌ها بازش کن.");
  } catch {
    toast("این فایل پشتیبان خوانده نشد.");
  }
}
async function persist() {
  if (state.drawing) return;
  const layers = [];
  for (const layer of state.doc.layers) {
    const blob = await new Promise((resolve) => layer.canvas.toBlob((item) => resolve(item), "image/png"));
    layers.push({ id: layer.id, name: layer.name, visible: layer.visible, opacity: layer.opacity, blend: layer.blend, lockAlpha: layer.lockAlpha, clip: layer.clip, photo: layer.photo, photoScale: layer.photoScale, blob });
  }
  const brand = { ...state.brand, sign: state.brand.sign?.toDataURL?.("image/png") || (typeof state.brand.sign === "string" ? state.brand.sign : null) };
  await saveProject({ id: state.projectId, name: state.projectName, updated: Date.now(), w: state.doc.w, h: state.doc.h, dpi: state.doc.dpi, wMm: state.doc.wMm, hMm: state.doc.hMm, productId: state.product.id, brand, layers });
  localStorage.setItem("niya-last", state.projectId);
  const ratio = await quotaRatio();
  if (ratio > 0.82) toast("حافظه‌ی مرورگر رو به پر شدن است. یک پشتیبان بگیر و پروژه‌ی قدیمی را پاک کن.");
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persist().catch(() => toast("ذخیره نشد. یک بار دیگر دکمه‌ی ذخیره را بزن.")), 400);
}
function mountPanels() {
  const left = document.getElementById("panel-left");
  const right = document.getElementById("panel-right");
  if (matchMedia("(min-width: 980px)").matches) {
    left.replaceChildren(el("h2", { text: "قلم‌ها" }), brushPanel());
    right.replaceChildren(el("h2", { text: "رنگ" }), colorPanel(), el("h2", { text: "لایه‌ها" }), layerPanel());
  }
}
function openNamed(name) {
  const map = {
    brush: ["قلم‌ها", brushPanel],
    color: ["رنگ", colorPanel],
    layers: ["لایه‌ها", layerPanel],
    products: ["وسیله‌ها", productPanel],
    tools: ["ابزار", toolPanel],
    menu: ["استودیو", menuPanel],
  };
  const item = map[name];
  if (!item) return;
  if (name === "brush") setTool("brush");
  openSheet(item[0], item[1]());
}
function welcome() {
  if (localStorage.getItem("niya-welcome")) return;
  const root = document.getElementById("welcome");
  root.hidden = false;
  root.replaceChildren(el("div", { class: "welcome-card" }, [
    el("p", { class: "eyebrow", text: "Niyayesh Studio" }),
    el("h1", { text: "استودیوی نیایش" }),
    el("p", { class: "hello", text: CONFIG.welcome }),
    el("ol", {}, [
      el("li", { text: "با قلم بکش، یا نقاشی روی شیشه را با دوربین بیاور." }),
      el("li", { text: "رنگ، لایه و تقارن را همین‌جا عوض کن." }),
      el("li", { text: "طرح را روی لیوان و بقیه‌ی وسیله‌ها ببین و فایل چاپ را بردار." }),
    ]),
    el("button", { class: "primary", text: "برویم سراغ نقاشی", onclick: () => { localStorage.setItem("niya-welcome", "1"); root.hidden = true; } }),
  ]));
}
function tick() {
  tick.frames = (tick.frames || 0) + 1;
  const now = performance.now();
  if (now - (tick.last || now) > 600) {
    fpsEl.textContent = `${Math.round(tick.frames * 1000 / (now - tick.last))} فریم`;
    tick.frames = 0;
    tick.last = now;
  }
  if (!tick.last) tick.last = now;
  requestAnimationFrame(tick);
}
async function useFile(file) {
  try {
    const canvas = await loadImageFile(file);
    if (state.imageUse === "palette") makePalette(canvas);
    else if (state.imageUse === "brush") makeBrush(canvas);
    else askImageUse(canvas);
    state.imageUse = null;
  } catch {
    toast("این عکس باز نشد. یکی دیگر را امتحان کن.");
  }
}
function bind() {
  overlay.addEventListener("pointerdown", pointerDown);
  overlay.addEventListener("pointermove", pointerMove);
  overlay.addEventListener("pointerup", pointerUp);
  overlay.addEventListener("pointercancel", pointerUp);
  stage.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = view.getBoundingClientRect();
    const before = docPoint(event, rect, state.cam);
    state.cam.zoom = Math.min(8, Math.max(0.04, state.cam.zoom * (event.deltaY < 0 ? 1.08 : 0.92)));
    const after = docPoint(event, rect, state.cam);
    state.cam.panX += before.x - after.x;
    state.cam.panY += before.y - after.y;
    redraw();
  }, { passive: false });
  document.getElementById("btn-menu").onclick = () => openNamed("menu");
  document.getElementById("btn-undo").onclick = async () => { if (await undo(state.doc)) redraw(); };
  document.getElementById("btn-redo").onclick = async () => { if (await redo(state.doc)) redraw(); };
  document.getElementById("btn-save").onclick = () => persist().then(() => toast("ذخیره شد.")).catch(() => toast("ذخیره نشد. کمی بعد دوباره بزن."));
  document.getElementById("sheet-close").onclick = shut;
  document.getElementById("sheet").addEventListener("click", (event) => { if (event.target.id === "sheet") shut(); });
  document.getElementById("btn-exit-full").onclick = () => { document.body.classList.remove("is-full"); layout(); };
  document.querySelectorAll("[data-open]").forEach((node) => { node.onclick = () => openNamed(node.dataset.open); });
  document.querySelectorAll("[data-tool]").forEach((node) => { node.onclick = () => setTool(node.dataset.tool); });
  fileInput.onchange = () => { if (fileInput.files[0]) useFile(fileInput.files[0]); fileInput.value = ""; };
  backupInput.onchange = () => { if (backupInput.files[0]) importBackup(backupInput.files[0]); backupInput.value = ""; };
  window.addEventListener("keydown", (event) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(event.target.tagName);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo(state.doc).then(() => redraw()) : undo(state.doc).then(() => redraw()); return; }
    if (typing) return;
    if (event.code === "Space") { spaceDown = true; event.preventDefault(); }
    const key = event.key.toLowerCase();
    if (key === "b") setTool("brush");
    if (key === "e") setTool("eraser");
    if (key === "g") setTool("fill");
    if (key === "i") setTool("eyedropper");
  });
  window.addEventListener("keyup", (event) => { if (event.code === "Space") spaceDown = false; });
  window.addEventListener("resize", layout);
  let fitted = false;
  new ResizeObserver(() => {
    if (!fitted && stage.clientHeight > 80) {
      fitted = true;
      fitView();
      return;
    }
    layout();
  }).observe(stage);
  document.addEventListener("visibilitychange", () => { if (document.hidden) persist().catch(() => {}); });
  window.addEventListener("pagehide", () => { persist().catch(() => {}); });
  setInterval(() => persist().catch(() => {}), 10000);
  window.addEventListener("error", (event) => {
    const message = String(event.message || "");
    if (message.includes("ResizeObserver")) return;
    toast("یک جای کار گیر کرد، ولی طرحت سر جایش است.");
  });
  window.addEventListener("unhandledrejection", () => toast("این کار انجام نشد. می‌توانی ادامه بدهی."));
}
async function boot() {
  try {
    state.brushes = await loadBrushes();
    state.products = await loadProducts();
    state.palettes = await loadPalettes();
    state.fonts = await loadFonts();
  } catch {
    toast("پرونده‌های استودیو کامل باز نشدند. اتصال را چک کن و صفحه را تازه کن.");
    return;
  }
  state.product = { ...state.products[0] };
  const size = fullMm(state.product);
  state.doc = createDocument(size.w, size.h, state.product.dpi);
  const last = localStorage.getItem("niya-last");
  if (last) {
    try { await restore(last); } catch { /* پروژه‌ی قبلی نماند */ }
  }
  bind();
  updateNote();
  welcome();
  requestAnimationFrame(() => { fitView(); mountPanels(); });
  rememberStorage();
  tick();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
}
boot();
