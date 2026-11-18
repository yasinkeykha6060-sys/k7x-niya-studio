import { CONFIG } from "./config.js";

export function defaultBrand() {
  return {
    name: CONFIG.brandName,
    nameEn: CONFIG.brandNameEn,
    slogan: CONFIG.tagline,
    colors: ["#ff5f9a", "#d8a94b", "#4a2038"],
    showLogo: false,
    showSign: false,
    logo: { shape: "circle", text: "ن" },
    sign: null,
  };
}
