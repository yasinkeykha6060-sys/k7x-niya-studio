import { flatten } from "./document.js";
import { rgbToHsv } from "./core.js";
import { CONFIG } from "./config.js";

async function pngBytes(canvas) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

function mmPt(mm) {
  return (mm * 72) / 25.4;
}

export function preflight(doc, product, texts) {
  const warns = [];
  if (doc.reduced || doc.dpi < 140) warns.push("رزولوشن برای چاپ ریز کمی پایین است. برای نمونه‌ی کوچک مناسب است.");
  const flat = flatten(doc, null);
  const ctx = flat.getContext("2d");
  const img = ctx.getImageData(0, 0, flat.width, flat.height);
  const inset = Math.round((((product.bleed || 0) + (product.safe || 0)) / 25.4) * doc.dpi);
  let outside = 0;
  const step = 6;
  for (let y = 0; y < img.height; y += step) {
    for (let x = 0; x < img.width; x += step) {
      if (x > inset && y > inset && x < img.width - inset && y < img.height - inset) continue;
      if (img.data[(y * img.width + x) * 4 + 3] > 20) outside++;
    }
  }
  if (outside > 12) warns.push("بخشی از طرح بیرون ناحیه‌ی امن است.");
  let hot = 0; let seen = 0;
  for (let i = 0; i < img.data.length; i += 80) {
    if (img.data[i + 3] < 20) continue;
    seen++;
    const hsv = rgbToHsv(img.data[i], img.data[i + 1], img.data[i + 2]);
    if (hsv.s > 0.92 && hsv.v > 0.45) hot++;
  }
  if (seen && hot / seen > 0.18) warns.push("رنگ‌های خیلی اشباع در چاپ معمولی ملایم‌تر می‌شوند. پیش‌نمایش تقریبی است.");
  if (doc.layers.some((layer) => layer.photo && layer.photoScale > 1.35)) warns.push("یک عکس از اندازه‌ی اصلی بزرگ شده و ممکن است تار چاپ شود.");
  if ((texts || []).some((box) => box.x < inset || box.y < inset || box.x + box.w > doc.w - inset || box.y + box.h > doc.h - inset)) {
    warns.push("متن خیلی نزدیک لبه است.");
  }
  return warns;
}

function cropMarks(page, x, y, w, h, color) {
  const len = 10;
  const gap = 3;
  const pairs = [
    [x - gap - len, y, x - gap, y],
    [x, y - gap - len, x, y - gap],
    [x + w + gap, y, x + w + gap + len, y],
    [x + w, y - gap - len, x + w, y - gap],
    [x - gap - len, y + h, x - gap, y + h],
    [x, y + h + gap, x, y + h + gap + len],
    [x + w + gap, y + h, x + w + gap + len, y + h],
    [x + w, y + h + gap, x + w, y + h + gap + len],
  ];
  for (const [x1, y1, x2, y2] of pairs) {
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.6, color });
  }
}

export async function printPdf(doc, product, cut) {
  const { PDFDocument, rgb } = await import("../vendor/pdf-lib.esm.min.js");
  const pdf = await PDFDocument.create();
  const margin = mmPt(6);
  const bleed = product.bleed || 0;
  const fullW = product.w + bleed * 2;
  const fullH = product.h + bleed * 2;
  const page = pdf.addPage([mmPt(fullW) + margin * 2, mmPt(fullH) + margin * 2]);
  const art = flatten(doc, null);
  const image = await pdf.embedPng(await pngBytes(art));
  page.drawImage(image, { x: margin, y: margin, width: mmPt(fullW), height: mmPt(fullH) });
  const trimX = margin + mmPt(bleed);
  const trimY = margin + mmPt(bleed);
  cropMarks(page, trimX, trimY, mmPt(product.w), mmPt(product.h), rgb(0.29, 0.13, 0.22));
  if (cut) {
    const cutImage = await pdf.embedPng(await pngBytes(cut));
    page.drawImage(cutImage, { x: margin, y: margin, width: mmPt(fullW), height: mmPt(fullH) });
  }
  pdf.setTitle(product.name);
  return pdf.save();
}

export async function orderPdf(lines, note) {
  await document.fonts.load("16px Vazirmatn");
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = 1754;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff9f4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#4a2038";
  ctx.font = "700 42px Vazirmatn";
  ctx.textAlign = "right";
  ctx.fillText("برگه‌ی سفارش چاپ", canvas.width - 70, 100);
  ctx.font = "400 22px Vazirmatn";
  ctx.fillStyle = "#b83266";
  ctx.fillText(CONFIG.brandName, canvas.width - 70, 146);
  ctx.fillStyle = "#4a2038";
  let y = 220;
  for (const line of lines) {
    ctx.font = "400 24px Vazirmatn";
    ctx.fillText(line, canvas.width - 70, y);
    y += 42;
  }
  y += 20;
  ctx.font = "400 22px Vazirmatn";
  wrapText(ctx, note || "", canvas.width - 70, y, canvas.width - 140, 36);
  const { PDFDocument } = await import("../vendor/pdf-lib.esm.min.js");
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const image = await pdf.embedPng(await pngBytes(canvas));
  page.drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
  return pdf.save();
}

function wrapText(ctx, text, x, y, max, lh) {
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > max) {
      ctx.fillText(line, x, y);
      y += lh;
      line = word;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
}

export async function lookbookPdf(pages) {
  await document.fonts.load("28px Vazirmatn");
  const { PDFDocument } = await import("../vendor/pdf-lib.esm.min.js");
  const pdf = await PDFDocument.create();
  for (const shot of pages) {
    const page = pdf.addPage([595, 842]);
    const image = await pdf.embedPng(await pngBytes(shot));
    page.drawImage(image, { x: 24, y: 24, width: 547, height: 794 });
  }
  return pdf.save();
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function shareOrSave(blob, name, title) {
  const file = new File([blob], name, { type: blob.type || "application/octet-stream" });
  try {
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({ files: [file], title });
      return "shared";
    }
  } catch (err) {
    if (err?.name === "AbortError") return "abort";
  }
  downloadBlob(blob, name);
  return "saved";
}

export function stampBrand(canvas, brand) {
  const ctx = canvas.getContext("2d");
  const s = Math.max(48, Math.round(canvas.width * 0.12));
  const x = canvas.width - s - 24;
  const y = canvas.height - s - 24;
  if (brand.showLogo) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = brand.colors?.[0] || "#ff5f9a";
    ctx.beginPath();
    if (brand.logo?.shape === "heart") {
      ctx.moveTo(s / 2, s * 0.7);
      ctx.bezierCurveTo(s * 0.55, s * 0.45, s, s * 0.2, s / 2, 0);
      ctx.bezierCurveTo(0, s * 0.2, s * 0.45, s * 0.45, s / 2, s * 0.7);
    } else {
      ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.fillStyle = "#fff9f4";
    ctx.font = `700 ${Math.round(s * 0.34)}px Vazirmatn`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(brand.logo?.text || "ن", s / 2, s / 2);
    ctx.restore();
  }
  if (brand.showSign && brand.sign) {
    const img = brand.sign;
    ctx.drawImage(img, 24, canvas.height - s - 16, s * 1.6, s * 0.7);
  }
}
