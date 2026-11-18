export async function loadProducts() {
  const data = await fetch("data/products.json");
  if (!data.ok) throw new Error("products");
  return data.json();
}

export async function loadPalettes() {
  const data = await fetch("data/palettes.json");
  if (!data.ok) throw new Error("palettes");
  return data.json();
}

export async function loadFonts() {
  const data = await fetch("data/fonts.json");
  if (!data.ok) throw new Error("fonts");
  return data.json();
}
