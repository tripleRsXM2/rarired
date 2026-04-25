#!/usr/bin/env node
// scripts/gen-pwa-icons.mjs
//
// Generate PNG app icons from public/favicon.svg for PWA installability:
//   - icon-192.png        (Android home screen)
//   - icon-512.png        (Android home screen large + iOS splash fallback)
//   - icon-512-maskable.png (Android adaptive icons — content lives inside
//                           a 80% safe zone so platform crops don't clip)
//   - apple-touch-icon-180.png (iOS Home Screen)
//
// Usage:  node scripts/gen-pwa-icons.mjs
//
// Run once after editing the source SVG. Outputs are committed so the
// runtime bundle doesn't depend on `sharp`.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

var here = dirname(fileURLToPath(import.meta.url));
var root = resolve(here, "..");
var srcSvg = resolve(root, "public/favicon.svg");
var outDir = resolve(root, "public/icons");
mkdirSync(outDir, { recursive: true });

var svg = readFileSync(srcSvg);

// Plain icons — full bleed of the existing brand mark on a white square
// so iOS/Android renderings have a solid background (the SVG itself has
// transparent areas around the diamond). 16px outer pad keeps the mark
// from touching the canvas edge on platforms that don't add padding.
async function plain(size, file) {
  var pad = Math.round(size * 0.08);
  var inner = size - pad * 2;
  var rendered = await sharp(svg, { density: 384 })
    .resize(inner, inner, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: size, height: size, channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: rendered, top: pad, left: pad }])
    .png()
    .toFile(resolve(outDir, file));
  console.log("✓", file);
}

// Maskable icon — content inside the 80% safe zone (Android crops to
// circles/squircles). Background extended to full canvas.
async function maskable(size, file) {
  var safe = Math.round(size * 0.7);
  var pad = Math.round((size - safe) / 2);
  var rendered = await sharp(svg, { density: 384 })
    .resize(safe, safe, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: size, height: size, channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: rendered, top: pad, left: pad }])
    .png()
    .toFile(resolve(outDir, file));
  console.log("✓", file);
}

await plain(192, "icon-192.png");
await plain(512, "icon-512.png");
await plain(180, "apple-touch-icon-180.png");
await maskable(512, "icon-512-maskable.png");
