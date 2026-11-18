export async function loadBrushes() {
  const data = await fetch("data/brushes.json");
  if (!data.ok) throw new Error("brushes");
  return data.json();
}
