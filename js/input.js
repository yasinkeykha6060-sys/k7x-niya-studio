export function docPoint(event, rect, cam) {
  const pressure = event.pressure > 0 ? event.pressure : 0.5;
  return {
    x: (event.clientX - rect.left) / cam.zoom + cam.panX,
    y: (event.clientY - rect.top) / cam.zoom + cam.panY,
    pressure,
    tilt: Math.hypot(event.tiltX || 0, event.tiltY || 0) / 60,
  };
}

export function palmRejected(event, penAt) {
  const now = performance.now();
  if (event.pointerType === "pen") return { reject: false, penAt: now };
  if (event.pointerType === "touch" && now - penAt < 900) return { reject: true, penAt };
  if (event.pointerType === "touch" && event.width > 40 && event.height > 40) return { reject: true, penAt };
  return { reject: false, penAt };
}

export function stabilize(previous, point, amount) {
  const gain = 1 - Math.min(0.92, Math.max(0, amount));
  if (!previous) return { ...point };
  return {
    x: previous.x + (point.x - previous.x) * gain,
    y: previous.y + (point.y - previous.y) * gain,
    pressure: point.pressure,
    tilt: point.tilt,
  };
}

export function snapValue(value, lines, slack) {
  for (const line of lines) if (Math.abs(value - line) <= slack) return line;
  return value;
}
