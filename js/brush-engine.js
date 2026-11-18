const cache = new Map();

function hex(n) {
  return Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, "0");
}

function css(color, a = 1) {
  return `rgba(${color.r|0},${color.g|0},${color.b|0},${a})`;
}

function foilColor(brush, color, x) {
  if (brush.special === "foil" && brush.foil) {
    const n = parseInt(brush.foil.slice(1), 16);
    const wave = 0.72 + 0.28 * Math.sin(x * 0.08);
    return { r: ((n >> 16) & 255) * wave, g: ((n >> 8) & 255) * wave, b: (n & 255) * wave };
  }
  if (brush.special === "holo") {
    const hue = (x * 0.7) % 360;
    const c = 1; const v = 1;
    const xx = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    let r = 0, g = 0, b = 0;
    if (hue < 60) [r, g, b] = [c, xx, 0];
    else if (hue < 120) [r, g, b] = [xx, c, 0];
    else if (hue < 180) [r, g, b] = [0, c, xx];
    else if (hue < 240) [r, g, b] = [0, xx, c];
    else if (hue < 300) [r, g, b] = [xx, 0, c];
    else [r, g, b] = [c, 0, xx];
    return { r: r * 255, g: g * 255, b: b * 255 };
  }
  return color;
}

function traceShape(ctx, tip, s) {
  ctx.beginPath();
  if (tip === "star") {
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 ? s * 0.4 : s;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const x = Math.cos(a) * rad; const y = Math.sin(a) * rad;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  } else if (tip === "heart") {
    ctx.moveTo(0, s * 0.35);
    ctx.bezierCurveTo(s * 0.1, s * 0.05, s * 0.95, -s * 0.15, 0, -s * 0.85);
    ctx.bezierCurveTo(-s * 0.95, -s * 0.15, -s * 0.1, s * 0.05, 0, s * 0.35);
  } else if (tip === "flower") {
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      ctx.moveTo(0, 0);
      ctx.arc(Math.cos(a) * s * 0.45, Math.sin(a) * s * 0.45, s * 0.38, 0, Math.PI * 2);
    }
    ctx.moveTo(s * 0.22, 0);
    ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2);
  } else if (tip === "leaf") {
    ctx.ellipse(0, 0, s * 0.35, s, 0.6, 0, Math.PI * 2);
  } else if (tip === "snow") {
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
    }
  } else if (tip === "square" || tip === "weave") {
    ctx.rect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4);
  } else if (tip === "flat" || tip === "nib") {
    ctx.ellipse(0, 0, s * (tip === "nib" ? 0.28 : 0.85), s * 0.28, 0, 0, Math.PI * 2);
  } else {
    ctx.arc(0, 0, s, 0, Math.PI * 2);
  }
}

function drawTip(ctx, brush, color, size) {
  const s = size / 2;
  const hard = brush.hardness ?? 0.5;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2);
  if (brush.tip === "spray" || brush.tip === "splatter" || brush.tip === "sponge" || brush.tip === "spark") {
    const n = brush.tip === "splatter" ? 8 : 18;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.random() ** 0.6 * s;
      const rad = brush.tip === "splatter" ? s * (0.05 + Math.random() * 0.25) : Math.max(0.6, s * 0.08);
      ctx.fillStyle = css(color, 0.35 + Math.random() * 0.65);
      ctx.beginPath();
      if (brush.tip === "spark") {
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, rad, 0, Math.PI * 2);
      } else {
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, rad, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  if (brush.tip === "bristle") {
    ctx.strokeStyle = css(color, 1);
    ctx.lineWidth = Math.max(0.6, s * 0.08);
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(i * s * 0.12, -s);
      ctx.quadraticCurveTo(i * s * 0.2, 0, i * s * 0.08, s);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  if (brush.tip === "snow") {
    ctx.strokeStyle = css(color, 1);
    ctx.lineWidth = Math.max(1, s * 0.12);
    traceShape(ctx, "snow", s);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (brush.tip === "glow") {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s);
    g.addColorStop(0, css(color, 1));
    g.addColorStop(0.4, css(color, 0.55));
    g.addColorStop(1, css(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  traceShape(ctx, brush.tip, brush.tip === "dot" ? s * 0.72 : s);
  if (hard > 0.92 || brush.tip === "dot" || brush.tip === "star" || brush.tip === "heart" || brush.tip === "flower" || brush.tip === "leaf") {
    ctx.fillStyle = css(color, 1);
    ctx.fill();
  } else {
    ctx.fillStyle = css(color, 1);
    ctx.fill();
    const g = ctx.createRadialGradient(0, 0, s * hard, 0, 0, s);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,1)");
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, s, 0, Math.PI * 2);
    ctx.fill();
  }
  if (brush.grain > 0.2) {
    ctx.globalCompositeOperation = "destination-out";
    const dots = Math.round(10 + brush.grain * 30);
    for (let i = 0; i < dots; i++) {
      ctx.fillStyle = `rgba(0,0,0,${brush.grain * 0.55})`;
      ctx.fillRect((Math.random() - 0.5) * s * 2, (Math.random() - 0.5) * s * 2, 1.4, 1.4);
    }
  }
  if (brush.tip === "weave") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 1;
    for (let i = -s; i <= s; i += 4) {
      ctx.beginPath();
      ctx.moveTo(i, -s); ctx.lineTo(i, s); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s, i); ctx.lineTo(s, i); ctx.stroke();
    }
  }
  ctx.restore();
}

export function clearStampCache() {
  cache.clear();
}

function stampCanvas(brush, color, size) {
  const key = [brush.id, brush.tip, size | 0, color.r | 0, color.g | 0, color.b | 0, brush.hardness, brush.grain].join(":");
  const hit = cache.get(key);
  if (hit) return hit;
  const pad = Math.ceil(size + 4);
  const c = document.createElement("canvas");
  c.width = c.height = pad;
  drawTip(c.getContext("2d"), brush, color, size);
  cache.set(key, c);
  if (cache.size > 48) cache.delete(cache.keys().next().value);
  return c;
}

export function paintStamp(ctx, brush, color, x, y, pressure, angle, customTip) {
  const p = pressure == null || pressure === 0 ? 0.5 : pressure;
  let size = (brush.size || 8) * (1 - (brush.pressureSize || 0) * (1 - p));
  size *= 1 + ((Math.random() - 0.5) * 2) * (brush.sizeJitter || 0);
  size = Math.max(1, size);
  const alpha = Math.max(0.02, Math.min(1, (brush.opacity ?? 1) * (brush.flow ?? 1) * (1 - (brush.pressureOpacity || 0) * (1 - p))));
  const scatter = (brush.scatter || 0) * size;
  const ox = (Math.random() - 0.5) * 2 * scatter;
  const oy = (Math.random() - 0.5) * 2 * scatter;
  const jitter = (brush.colorJitter || 0) * 255;
  const used = foilColor(brush, {
    r: color.r + (Math.random() - 0.5) * jitter,
    g: color.g + (Math.random() - 0.5) * jitter,
    b: color.b + (Math.random() - 0.5) * jitter,
  }, x + y);
  ctx.save();
  ctx.translate(x + ox, y + oy);
  ctx.rotate((angle || 0) + (Math.random() - 0.5) * (brush.angleJitter || 0));
  ctx.globalAlpha = alpha;
  let op = brush.composite || "source-over";
  if (op === "multiply") op = "source-over";
  ctx.globalCompositeOperation = op;
  if (brush._lockAlpha && !brush.eraser) ctx.globalCompositeOperation = "source-atop";
  if (customTip) {
    ctx.drawImage(customTip, -size / 2, -size / 2, size, size);
  } else if (brush.special === "neon" && !brush._lite) {
    ctx.shadowColor = css(used, 0.9);
    ctx.shadowBlur = Math.min(18, size);
    const stamp = stampCanvas(brush, used, size);
    ctx.drawImage(stamp, -stamp.width / 2, -stamp.height / 2);
  } else {
    const stamp = stampCanvas(brush, used, size);
    ctx.drawImage(stamp, -stamp.width / 2, -stamp.height / 2);
    if (brush.wet && !brush._lite) {
      ctx.globalAlpha = alpha * 0.28;
      ctx.drawImage(stamp, -stamp.width / 2 + size * 0.18, -stamp.height / 2 + size * 0.05);
    }
  }
  ctx.restore();
  return { size, color: used };
}

export function beginStroke() {
  return { x: 0, y: 0, dist: 0, alive: false, angle: 0 };
}

export function strokePoints(ctx, stroke, brush, color, points, customTip, hooks) {
  if (!points.length) return;
  if (!stroke.alive) {
    const p0 = points[0];
    stroke.x = p0.x; stroke.y = p0.y; stroke.alive = true; stroke.dist = 0;
    const painted = paintStamp(ctx, brush, color, p0.x, p0.y, p0.pressure, 0, customTip);
    hooks?.onStamp?.(p0.x, p0.y, painted);
    points = points.slice(1);
  }
  for (const p of points) {
    const dx = p.x - stroke.x;
    const dy = p.y - stroke.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.01) continue;
    const spacing = Math.max(0.8, (brush.size || 8) * (brush.spacing || 0.1));
    let travel = spacing - (stroke.dist % spacing);
    if (travel <= 0) travel = spacing;
    const ang = Math.atan2(dy, dx);
    stroke.angle = ang;
    while (travel <= dist) {
      const t = travel / dist;
      const x = stroke.x + dx * t;
      const y = stroke.y + dy * t;
      const painted = paintStamp(ctx, brush, color, x, y, p.pressure, brush.rotate ? ang : (brush.angle || 0) * Math.PI / 180, customTip);
      hooks?.onStamp?.(x, y, painted);
      travel += spacing;
    }
    stroke.x = p.x;
    stroke.y = p.y;
    stroke.dist += dist;
  }
}

export function previewBrush(canvas, brush) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const stroke = beginStroke();
  const color = brush.special === "foil"
    ? { r: 216, g: 169, b: 75 }
    : brush.eraser ? { r: 180, g: 140, b: 150 } : { r: 232, g: 74, b: 127 };
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    pts.push({ x: 8 + i * ((canvas.width - 16) / 16), y: canvas.height / 2 + Math.sin(i / 2) * 7, pressure: 0.35 + 0.6 * Math.sin(i / 5) ** 2 });
  }
  const demo = brush.eraser ? { ...brush, composite: "source-over", eraser: false } : brush;
  strokePoints(ctx, stroke, demo, color, pts, null, null);
}

export function hexOf(color) {
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
}
