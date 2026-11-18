import { colorName, hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from "./core.js";

export function toRgb(color) {
  return { ...hsvToRgb(color.h, color.s, color.v), a: color.a ?? 1 };
}

export function fromHex(hex, alpha = 1) {
  const rgb = hexToRgb(hex);
  return { ...rgbToHsv(rgb.r, rgb.g, rgb.b), a: alpha };
}

export function harmony(h, kind) {
  const turn = (n) => (h + n + 360) % 360;
  if (kind === "complement") return [h, turn(180)];
  if (kind === "triad") return [h, turn(120), turn(240)];
  if (kind === "analog") return [turn(-30), h, turn(30)];
  return [h, turn(90), turn(180), turn(270)];
}

export function paintWheel(canvas) {
  const ctx = canvas.getContext("2d");
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const r = cx - 2;
  for (let a = 0; a < 360; a += 1) {
    ctx.beginPath();
    ctx.strokeStyle = `hsl(${a} 90% 58%)`;
    ctx.lineWidth = r * 0.22;
    ctx.arc(cx, cy, r * 0.78, (a - 1) * Math.PI / 180, (a + 1.4) * Math.PI / 180);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}

export function paintSquare(canvas, hue) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const base = ctx.createLinearGradient(0, 0, w, 0);
  base.addColorStop(0, "#fff");
  base.addColorStop(1, `hsl(${hue} 100% 50%)`);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const shade = ctx.createLinearGradient(0, 0, 0, h);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(1, "#000");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
}

export { colorName, rgbToHex, hsvToRgb };
