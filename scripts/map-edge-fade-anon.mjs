#!/usr/bin/env node
// Anonymous probe — skips auth, just visits /map and checks if the
// vignette overlay div has its inline styles applied. Works even
// without Supabase env vars on the deploy.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

var SITE = "https://rarired-git-mdawg-michaellhuerto-6485s-projects.vercel.app";

async function main() {
  var browser = await chromium.launch({ headless: true });
  var ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  var page = await ctx.newPage();
  await page.goto(SITE + "/map", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  var dump = await page.evaluate(function () {
    var frame = document.querySelector(".cs-map-frame");
    if (!frame) return { err: "no .cs-map-frame", body: document.body.innerHTML.slice(0, 400) };
    var children = Array.from(frame.children);
    return {
      childCount: children.length,
      ariaHidden: children
        .filter(function (el) { return el.getAttribute("aria-hidden") === "true"; })
        .map(function (el) {
          var st = getComputedStyle(el);
          return {
            tag: el.tagName,
            zIndex: st.zIndex,
            position: st.position,
            pointerEvents: st.pointerEvents,
            backgroundImageLen: (st.backgroundImage || "").length,
            backgroundImageHead: (st.backgroundImage || "").slice(0, 220),
            boxShadow: (st.boxShadow || "").slice(0, 200),
          };
        }),
    };
  });
  console.log(JSON.stringify(dump, null, 2));

  await mkdir("scripts/_screens", { recursive: true });
  await page.screenshot({ path: "scripts/_screens/map-edge-fade-anon.png", fullPage: false });
  console.log("screenshot -> scripts/_screens/map-edge-fade-anon.png");
  await browser.close();
}
main().catch(function (e) { console.error("FAIL:", e.message); process.exit(1); });
