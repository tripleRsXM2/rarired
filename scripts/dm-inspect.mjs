#!/usr/bin/env node
/**
 * Minimal diagnostic — load the app, wait, screenshot, dump DOM shape.
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

var OUT = "/tmp/dm-inspect";
fs.mkdirSync(OUT, { recursive: true });

var URL = "https://rarired-git-mdawg-miikhcs-projects.vercel.app/";

async function main() {
  var browser = await chromium.launch({ headless: true });
  var ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  var page = await ctx.newPage();

  var errors = [];
  page.on("pageerror", function (e) { errors.push(String(e)); });

  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, "landing.png"), fullPage: true });

  // Find every visible element with meaningful text.
  var layout = await page.evaluate(function () {
    function visible(el) {
      var r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      var cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
      return true;
    }
    var out = [];
    document.querySelectorAll("button, a, h1, h2, h3").forEach(function (el) {
      if (!visible(el)) return;
      var t = (el.innerText || "").trim();
      if (!t) return;
      var r = el.getBoundingClientRect();
      out.push({ tag: el.tagName, text: t.slice(0, 60), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
    });
    return out;
  });

  console.log("visible layout:");
  layout.forEach(function (e) { console.log("  " + e.tag.padEnd(8) + " @ " + String(e.x).padStart(4) + "," + String(e.y).padStart(4) + "  [" + e.w + "x" + e.h + "]  " + e.text); });

  // What's covering the viewport at (top-right) where Log-in buttons live?
  var coverer = await page.evaluate(function () {
    var el = document.elementFromPoint(1350, 50); // near top-right
    if (!el) return null;
    return { tag: el.tagName, cls: el.className || "", text: (el.innerText || "").slice(0, 50) };
  });
  console.log("element at top-right 1350,50:", JSON.stringify(coverer));

  // Write HTML
  var html = await page.content();
  fs.writeFileSync(path.join(OUT, "landing.html"), html);

  console.log("errors:", errors.length);
  errors.forEach(function (e) { console.log("  " + e); });

  await browser.close();
  console.log("screenshots + html in " + OUT);
}

main().catch(function (e) { console.error(e); process.exit(1); });
