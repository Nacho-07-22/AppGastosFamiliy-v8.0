// Simple script to generate 192x192 and 512x512 icons from a source image using sharp
const sharp = require("sharp");
const path = require("path");

const src = path.resolve(__dirname, "..", "source-icon.png");
const out192 = path.resolve(__dirname, "..", "icon-house-192.png");
const out512 = path.resolve(__dirname, "..", "icon-house-512.png");

async function gen() {
  try {
    await sharp(src)
      .resize(192, 192, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .toFile(out192);
    await sharp(src)
      .resize(512, 512, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .toFile(out512);
    console.log("Icons generated:", out192, out512);
  } catch (err) {
    console.error("Failed to generate icons:", err);
    process.exit(1);
  }
}

gen();
