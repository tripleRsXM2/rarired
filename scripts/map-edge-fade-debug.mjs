#!/usr/bin/env node
// Forensic debug: dump every aria-hidden child + bundle check for v5.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

var SITE = "https://rarired-git-mdawg-miikhcs-projects.vercel.app";

async function getCreds(page) {
  var html = await page.content();
  var m = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
  var js = await (await fetch(SITE + m[1])).text();
  return {
    url: js.match(/(https:\/\/[a-z0-9]+\.supabase\.co)/)[1],
    key: js.match(/(eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)/)[1],
    bundleUrl: SITE + m[1],
    bundle: js,
  };
}

async function main() {
  var browser = await chromium.launch({ headless: true });
  var ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  var page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  var creds = await getCreds(page);

  // Bundle string check — is v5 actually shipped?
  var bundleHasV5 = /linear-gradient\(to bottom,/.test(creds.bundle) && /no-repeat/.test(creds.bundle);
  var bundleHasV4 = /radial-gradient\(ellipse 70% 80%/.test(creds.bundle);
  var bundleHasV3 = /inset 0 0 110px 16px/.test(creds.bundle);
  console.log("[bundle] url:", creds.bundleUrl);
  console.log("[bundle] hasV5 strips:", bundleHasV5);
  console.log("[bundle] hasV4 radial:", bundleHasV4);
  console.log("[bundle] hasV3 shadow:", bundleHasV3);

  var client = createClient(creds.url, creds.key, { auth: { persistSession: false } });
  var { data } = await client.auth.signInWithPassword({ email: "test@test.com", password: "123456" });
  var ref = creds.url.replace("https://","").split(".")[0];
  await page.evaluate(function(a){ localStorage.setItem(a.k, a.v); },
    { k: "sb-" + ref + "-auth-token", v: JSON.stringify(data.session) });

  await page.goto(SITE + "/map", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5500);

  var dump = await page.evaluate(function () {
    var frame = document.querySelector(".cs-map-frame");
    if (!frame) return { err: "no frame" };
    var children = Array.from(frame.children);
    return {
      childCount: children.length,
      children: children.map(function (el, i) {
        var st = getComputedStyle(el);
        return {
          i: i,
          tag: el.tagName,
          cls: (el.className || "").toString().slice(0, 40),
          ariaHidden: el.getAttribute("aria-hidden"),
          zIndex: st.zIndex,
          position: st.position,
          pointerEvents: st.pointerEvents,
          backgroundImage: (st.backgroundImage || "").slice(0, 300),
          boxShadow: (st.boxShadow || "").slice(0, 200),
          rect: (function () {
            var r = el.getBoundingClientRect();
            return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
          })(),
        };
      }),
    };
  });
  console.log("[dom]", JSON.stringify(dump, null, 2));
  await browser.close();
}
main().catch(function (e) { console.error("FAIL:", e.message); process.exit(1); });
