function fitDraw(ctx, art, x, y, w, h, mode) {
  const scale = mode === "fill" ? Math.max(w / art.width, h / art.height) : Math.min(w / art.width, h / art.height);
  const dw = art.width * scale;
  const dh = art.height * scale;
  ctx.drawImage(art, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

export function drawMockup(canvas, product, art, tint, mode = "fit") {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const paper = ctx.createLinearGradient(0, 0, 0, h);
  paper.addColorStop(0, "#fff5f8");
  paper.addColorStop(1, "#ffe3ec");
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);
  const kind = product.mockup;
  if (kind === "shirt" || kind === "tote") drawShirt(ctx, w, h, art, tint, kind, mode);
  else if (kind === "book") drawBook(ctx, w, h, art, mode);
  else if (kind === "phone") drawPhone(ctx, w, h, art, mode);
  else if (kind === "poster") drawPoster(ctx, w, h, art, mode);
  else if (kind === "sticker") drawSticker(ctx, w, h, art);
  else if (kind === "wrap") drawWrap(ctx, w, h, art);
  else if (kind === "mug") drawMugFlat(ctx, w, h, art, tint);
  else drawCard(ctx, w, h, art, mode);
  ctx.fillStyle = "#b83266";
  ctx.font = "600 16px Vazirmatn";
  ctx.textAlign = "center";
  ctx.fillText(product.name, w / 2, h - 16);
}

function shadow(ctx) {
  ctx.shadowColor = "rgba(184,50,102,0.25)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
}

function drawShirt(ctx, w, h, art, tint, kind, mode) {
  ctx.save();
  shadow(ctx);
  ctx.fillStyle = tint || "#fff9f4";
  ctx.beginPath();
  ctx.moveTo(w * 0.28, h * 0.22);
  ctx.lineTo(w * 0.18, h * 0.32);
  ctx.lineTo(w * 0.28, h * 0.38);
  ctx.lineTo(w * 0.32, h * 0.78);
  ctx.quadraticCurveTo(w * 0.5, h * 0.84, w * 0.68, h * 0.78);
  ctx.lineTo(w * 0.72, h * 0.38);
  ctx.lineTo(w * 0.82, h * 0.32);
  ctx.lineTo(w * 0.72, h * 0.22);
  ctx.quadraticCurveTo(w * 0.5, h * 0.34, w * 0.28, h * 0.22);
  ctx.fill();
  ctx.shadowColor = "transparent";
  if (kind === "tote") {
    ctx.strokeStyle = tint || "#fff9f4";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(w * 0.36, h * 0.24);
    ctx.quadraticCurveTo(w * 0.36, h * 0.1, w * 0.5, h * 0.1);
    ctx.quadraticCurveTo(w * 0.64, h * 0.1, w * 0.64, h * 0.24);
    ctx.stroke();
  }
  ctx.save();
  roundClip(ctx, w * 0.34, h * 0.36, w * 0.32, h * 0.32, 12);
  ctx.globalCompositeOperation = "multiply";
  fitDraw(ctx, art, w * 0.34, h * 0.36, w * 0.32, h * 0.32, mode);
  ctx.restore();
  ctx.restore();
}

function drawBook(ctx, w, h, art, mode) {
  ctx.save();
  shadow(ctx);
  ctx.fillStyle = "#fff9f4";
  ctx.fillRect(w * 0.22, h * 0.16, w * 0.5, h * 0.66);
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "#e84a7f";
  ctx.fillRect(w * 0.22, h * 0.16, w * 0.04, h * 0.66);
  ctx.save();
  ctx.beginPath();
  ctx.rect(w * 0.28, h * 0.18, w * 0.42, h * 0.62);
  ctx.clip();
  fitDraw(ctx, art, w * 0.28, h * 0.18, w * 0.42, h * 0.62, mode);
  ctx.restore();
  ctx.restore();
}

function drawPhone(ctx, w, h, art, mode) {
  ctx.save();
  shadow(ctx);
  round(ctx, w * 0.3, h * 0.12, w * 0.4, h * 0.7, 28);
  ctx.fillStyle = "#4a2038";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.save();
  round(ctx, w * 0.33, h * 0.16, w * 0.34, h * 0.6, 18);
  ctx.clip();
  fitDraw(ctx, art, w * 0.33, h * 0.16, w * 0.34, h * 0.6, mode);
  ctx.restore();
  ctx.restore();
}

function drawPoster(ctx, w, h, art, mode) {
  ctx.save();
  shadow(ctx);
  ctx.fillStyle = "#d8a94b";
  ctx.fillRect(w * 0.16, h * 0.1, w * 0.68, h * 0.72);
  ctx.shadowColor = "transparent";
  ctx.save();
  ctx.beginPath();
  ctx.rect(w * 0.2, h * 0.14, w * 0.6, h * 0.64);
  ctx.clip();
  fitDraw(ctx, art, w * 0.2, h * 0.14, w * 0.6, h * 0.64, mode);
  ctx.restore();
  ctx.restore();
}

function drawSticker(ctx, w, h, art) {
  ctx.save();
  shadow(ctx);
  ctx.fillStyle = "#fff";
  round(ctx, w * 0.22, h * 0.18, w * 0.56, h * 0.56, 18);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.save();
  round(ctx, w * 0.22, h * 0.18, w * 0.56, h * 0.56, 18);
  ctx.clip();
  fitDraw(ctx, art, w * 0.22, h * 0.18, w * 0.56, h * 0.56, "fit");
  ctx.restore();
  ctx.restore();
}

function drawWrap(ctx, w, h, art) {
  const tw = w / 3;
  const th = h / 3;
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) ctx.drawImage(art, x * tw, y * th, tw, th);
  }
}

function drawCard(ctx, w, h, art, mode) {
  ctx.save();
  shadow(ctx);
  ctx.fillStyle = "#fff";
  round(ctx, w * 0.14, h * 0.16, w * 0.72, h * 0.62, 16);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.save();
  round(ctx, w * 0.14, h * 0.16, w * 0.72, h * 0.62, 16);
  ctx.clip();
  fitDraw(ctx, art, w * 0.14, h * 0.16, w * 0.72, h * 0.62, mode);
  ctx.restore();
  ctx.restore();
}

function drawMugFlat(ctx, w, h, art, tint) {
  ctx.save();
  shadow(ctx);
  ctx.fillStyle = tint || "#fff9f4";
  round(ctx, w * 0.22, h * 0.22, w * 0.48, h * 0.5, 20);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = tint || "#fff9f4";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(w * 0.7, h * 0.46, h * 0.12, -1, 1);
  ctx.stroke();
  ctx.save();
  round(ctx, w * 0.26, h * 0.28, w * 0.4, h * 0.38, 12);
  ctx.clip();
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(art, w * 0.26, h * 0.28, w * 0.4, h * 0.38);
  ctx.restore();
  ctx.restore();
}

function round(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function roundClip(ctx, x, y, w, h, r) {
  round(ctx, x, y, w, h, r);
  ctx.clip();
}

let mugHandle = null;

export async function openMug(container, art, tint) {
  closeMug();
  const THREE = await import("../vendor/three.module.js");
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  const w = container.clientWidth || 320;
  const h = container.clientHeight || 280;
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  container.innerHTML = "";
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, w / h, 0.1, 20);
  camera.position.set(2.3, 0.4, 3.4);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(0xfff1f6, 0.85));
  const sun = new THREE.DirectionalLight(0xffffff, 1.15);
  sun.position.set(3, 4, 5);
  scene.add(sun);
  const tex = new THREE.CanvasTexture(art);
  if ("colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.78, 1.7, 72, 1, true),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0.04, side: THREE.DoubleSide, color: tint || "#fff9f4" }),
  );
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.07, 16, 40, Math.PI),
    new THREE.MeshStandardMaterial({ color: tint || "#fff9f4", roughness: 0.4 }),
  );
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0.95, 0, 0);
  body.add(handle);
  scene.add(body);
  let drag = false;
  let lx = 0;
  const down = (e) => { drag = true; lx = e.clientX; };
  const up = () => { drag = false; };
  const move = (e) => { if (!drag) return; body.rotation.y += (e.clientX - lx) * 0.01; lx = e.clientX; };
  renderer.domElement.addEventListener("pointerdown", down);
  window.addEventListener("pointerup", up);
  renderer.domElement.addEventListener("pointermove", move);
  let frame = 0;
  const loop = () => { frame = requestAnimationFrame(loop); renderer.render(scene, camera); };
  loop();
  mugHandle = () => {
    cancelAnimationFrame(frame);
    renderer.domElement.removeEventListener("pointerdown", down);
    renderer.domElement.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    tex.dispose();
    body.geometry.dispose();
    body.material.dispose();
    handle.geometry.dispose();
    handle.material.dispose();
    renderer.dispose();
    container.innerHTML = "";
    mugHandle = null;
  };
}

export function closeMug() {
  mugHandle?.();
}
