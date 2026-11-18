let toastTimer = 0;

export function toast(message) {
  const node = document.getElementById("toast");
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 4200);
}

export function el(tag, attrs = {}, kids = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value);
  }
  for (const kid of [].concat(kids)) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

export function openSheet(title, body) {
  const sheet = document.getElementById("sheet");
  document.getElementById("sheet-title").textContent = title;
  const host = document.getElementById("sheet-body");
  host.replaceChildren(body);
  sheet.hidden = false;
  document.body.classList.add("sheet-open");
}

export function closeSheet() {
  document.getElementById("sheet").hidden = true;
  document.body.classList.remove("sheet-open");
}

export function field(label, node) {
  return el("label", { class: "field" }, [el("span", { text: label }), node]);
}
