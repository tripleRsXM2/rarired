#!/usr/bin/env node
/**
 * scripts/dm-emoji-probe.mjs
 *
 * Authenticate directly against Supabase (bypasses the UI login flow),
 * inject the session into the browser's localStorage, then drive the DM
 * UI to reproduce the emoji picker bug. Captures console errors, page
 * errors, and screenshots at every step.
 *
 * Usage:
 *   node scripts/dm-emoji-probe.mjs <email> <password>
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

var [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("usage: node scripts/dm-emoji-probe.mjs <email> <password>");
  process.exit(2);
}

// Pull Supabase URL + anon key from the deployed site so we auth against
// the same instance the Vercel preview uses.
var SITE = "https://rarired-git-mdawg-miikhcs-projects.vercel.app";
var OUT = "/tmp/dm-emoji-probe";
fs.mkdirSync(OUT, { recursive: true });

function log(msg) { console.log("[probe]", msg); }

// Scrape the Supabase URL + anon key out of the production bundle so we
// can talk to the same Postgres. They're baked into the JS at build time
// via Vite's import.meta.env.* substitution.
async function getSupabaseCreds(page) {
  var html = await page.content();
  var bundleMatch = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
  if (!bundleMatch) throw new Error("couldn't find bundle path in HTML");
  var bundleUrl = SITE + bundleMatch[1];
  log("bundle: " + bundleUrl);
  var res = await fetch(bundleUrl);
  var js = await res.text();
  var url = js.match(/(https:\/\/[a-z0-9]+\.supabase\.co)/);
  var key = js.match(/(eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)/);
  if (!url || !key) throw new Error("couldn't extract Supabase creds from bundle");
  return { url: url[1], key: key[1] };
}

async function main() {
  var browser = await chromium.launch({ headless: true });
  var ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  var page = await ctx.newPage();

  var consoleMessages = [];
  var pageErrors = [];
  var netErrors = [];
  page.on("console", function (m) { consoleMessages.push({ type: m.type(), text: m.text() }); });
  page.on("pageerror", function (e) { pageErrors.push(String(e)); });
  page.on("response", function (r) {
    if (r.status() >= 400) netErrors.push({ status: r.status(), url: r.url() });
  });

  // Load the site once so we can read the bundle URL and extract creds.
  await page.goto(SITE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  var creds = await getSupabaseCreds(page);
  log("supabase url: " + creds.url);

  // Auth directly against Supabase — NO UI clicks.
  log("signing in via Supabase API");
  var client = createClient(creds.url, creds.key, { auth: { persistSession: false } });
  var { data: authData, error: authErr } = await client.auth.signInWithPassword({ email: email, password: password });
  if (authErr) { log("auth failed: " + authErr.message); await browser.close(); process.exit(1); }
  log("auth ok, uid: " + authData.user.id);

  // Inject the session into the browser's localStorage. The Supabase JS
  // client stores under `sb-<projectRef>-auth-token`.
  var projectRef = creds.url.replace("https://", "").split(".")[0];
  var sessionKey = "sb-" + projectRef + "-auth-token";
  var sessionValue = JSON.stringify(authData.session);
  log("injecting session under " + sessionKey);
  await page.evaluate(function (args) {
    localStorage.setItem(args.k, args.v);
  }, { k: sessionKey, v: sessionValue });

  // Navigate now that we're authed.
  log("goto /people/messages");
  await page.goto(SITE + "/people/messages", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, "01-messages.png"), fullPage: true });

  // Pre-state: is the notifications panel already open before we touch anything?
  var preState = await page.evaluate(function () {
    var p = document.querySelector(".cs-notif-panel");
    return { panelPresent: !!p };
  });
  log("panel present BEFORE conv click: " + JSON.stringify(preState));

  // Find the first conversation row button — must have the date-like
  // suffix pattern (digits + " " + month / "d ago" / etc) and NOT be
  // the sidebar Notifications button.
  var convClicked = await page.evaluate(function () {
    var buttons = Array.from(document.querySelectorAll("button"));
    var conv = buttons.find(function (b) {
      var t = (b.innerText || "").trim();
      if (t.includes("Log in") || t.startsWith("Notifications") || t.includes("Sign in")) return false;
      // Conv-list rows look like "J\nJohn\n21 Apr" or "J\nJohn\n2d ago".
      return b.offsetWidth > 300 && /\n/.test(t) && t.length < 200;
    });
    if (!conv) return { ok: false, reason: "no conv row found" };
    conv.click();
    return { ok: true, text: (conv.innerText || "").slice(0, 80) };
  });
  log("conv click: " + JSON.stringify(convClicked));
  if (!convClicked.ok) {
    var allBtns = await page.evaluate(function () {
      return Array.from(document.querySelectorAll("button")).map(function (b) {
        var t = (b.innerText || "").trim();
        return { w: b.offsetWidth, h: b.offsetHeight, text: t.slice(0, 60) };
      }).filter(function (b) { return b.w > 100 && b.h > 20 && b.text.length > 1; });
    });
    log("buttons on page:");
    allBtns.forEach(function (b) { log("  [" + b.w + "x" + b.h + "] " + JSON.stringify(b.text)); });
  }
  await page.waitForTimeout(1500);

  var postOpenState = await page.evaluate(function () {
    var p = document.querySelector(".cs-notif-panel");
    return { panelPresent: !!p };
  });
  log("panel present AFTER conv open: " + JSON.stringify(postOpenState));
  await page.screenshot({ path: path.join(OUT, "02-conv-open.png"), fullPage: true });

  // Now try the emoji button.
  var emojiInfo = await page.evaluate(function () {
    var btn = document.querySelector('button[aria-label="Insert emoji"]');
    if (!btn) return { found: false };
    var r = btn.getBoundingClientRect();
    // Also snapshot what elementFromPoint returns at the button's center —
    // if it's not the button itself, something is covering it.
    var cx = r.x + r.width/2, cy = r.y + r.height/2;
    var top = document.elementFromPoint(cx, cy);
    return {
      found: true,
      visible: r.width > 0 && r.height > 0,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      topElement: top ? { tag: top.tagName, cls: top.className || "", label: top.getAttribute("aria-label") || "" } : null,
      topIsButton: top === btn,
    };
  });
  log("emoji button info: " + JSON.stringify(emojiInfo));

  if (emojiInfo.found) {
    log("clicking emoji button via page.mouse");
    await page.mouse.click(emojiInfo.rect.x + emojiInfo.rect.w/2, emojiInfo.rect.y + emojiInfo.rect.h/2);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, "03-after-emoji-click.png"), fullPage: true });

    var pickerState = await page.evaluate(function () {
      var p = document.querySelector('[role="dialog"][aria-label="Pick an emoji"]');
      if (!p) return { found: false };
      var r = p.getBoundingClientRect();
      return { found: true, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, visible: r.width > 0 && r.height > 0 };
    });
    log("picker after click: " + JSON.stringify(pickerState));

    // Try actually picking an emoji — this is what the user complains
    // doesn't work. Find the first emoji button in the grid and click it.
    var pickResult = await page.evaluate(function () {
      var picker = document.querySelector('[role="dialog"][aria-label="Pick an emoji"]');
      if (!picker) return { ok: false, reason: "no picker" };
      var buttons = Array.from(picker.querySelectorAll("button"));
      // Skip category tabs — they have aria-label. Emoji buttons don't.
      var emojiBtns = buttons.filter(function (b) { return !b.getAttribute("aria-label"); });
      if (!emojiBtns.length) return { ok: false, reason: "no emoji buttons", totalButtons: buttons.length };
      var b = emojiBtns[0];
      var r = b.getBoundingClientRect();
      var cx = r.x + r.width/2, cy = r.y + r.height/2;
      var top = document.elementFromPoint(cx, cy);
      return {
        ok: true,
        emoji: (b.innerText || "").trim(),
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        topAtPoint: top ? { tag: top.tagName, text: (top.innerText || "").slice(0, 20), isSame: top === b } : null,
      };
    });
    log("first emoji btn info: " + JSON.stringify(pickResult));

    if (pickResult.ok) {
      var cx = pickResult.rect[0] + pickResult.rect[2]/2;
      var cy = pickResult.rect[1] + pickResult.rect[3]/2;
      log("clicking emoji " + pickResult.emoji + " at " + cx + "," + cy);
      await page.mouse.click(cx, cy);
      await page.waitForTimeout(400);
      var afterPick = await page.evaluate(function () {
        var ta = document.querySelector('textarea, input[type="text"]');
        var picker = document.querySelector('[role="dialog"][aria-label="Pick an emoji"]');
        return {
          draft: ta ? ta.value : null,
          pickerStillOpen: !!picker,
        };
      });
      log("after pick: " + JSON.stringify(afterPick));
      await page.screenshot({ path: path.join(OUT, "03b-after-emoji-pick.png"), fullPage: true });
    }
  }

  // Close emoji picker if still open — click in the thread middle, NOT
  // the sidebar (which would hit the Notifications button).
  await page.mouse.click(700, 400);
  await page.waitForTimeout(300);

  // Find chat bubbles via React fiber — a bubble has onTouchStart AND
  // onContextMenu props (unique combo in this codebase). Much more
  // robust than guessing via computed styles.
  var bubbleInfo = await page.evaluate(function () {
    var all = Array.from(document.querySelectorAll("div"));
    function propsOf(el) {
      var key = Object.keys(el).find(function (k) { return k.startsWith("__reactProps$"); });
      return key ? el[key] : null;
    }
    var bubbles = all.filter(function (d) {
      var p = propsOf(d);
      if (!p) return false;
      return typeof p.onTouchStart === "function"
          && typeof p.onContextMenu === "function"
          && typeof p.onClick === "function";
    });
    if (!bubbles.length) return { found: false, totalDivs: all.length };
    var b = bubbles[bubbles.length - 1];
    var r = b.getBoundingClientRect();
    return {
      found: true,
      count: bubbles.length,
      text: b.innerText.slice(0, 60),
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      hasOnClick: true,
    };
  });
  log("last bubble: " + JSON.stringify(bubbleInfo));

  if (bubbleInfo.found) {
    // What's at the bubble's center BEFORE we click?
    var cx = bubbleInfo.rect.x + bubbleInfo.rect.w/2;
    var cy = bubbleInfo.rect.y + bubbleInfo.rect.h/2;
    var atPoint = await page.evaluate(function (args) {
      var el = document.elementFromPoint(args.x, args.y);
      if (!el) return null;
      function propsOf(e) {
        var key = Object.keys(e).find(function (k) { return k.startsWith("__reactProps$"); });
        return key ? e[key] : null;
      }
      var p = propsOf(el);
      return {
        tag: el.tagName, cls: el.className || "", id: el.id || "",
        text: (el.innerText || "").slice(0, 40),
        z: getComputedStyle(el).zIndex,
        hasOnClick: !!(p && typeof p.onClick === "function"),
        hasOnTouchStart: !!(p && typeof p.onTouchStart === "function"),
      };
    }, { x: cx, y: cy });
    log("elementFromPoint at bubble center: " + JSON.stringify(atPoint));

    // Trace upward from that point to the root. Looking for which
    // ancestor carries a position:fixed, z-index, and panel/toast-ish
    // class so we know what's intercepting the click.
    var ancestors = await page.evaluate(function (args) {
      var el = document.elementFromPoint(args.x, args.y);
      var trail = [];
      while (el && el !== document.documentElement) {
        var cs = getComputedStyle(el);
        if (cs.position === "fixed" || cs.position === "absolute" || parseInt(cs.zIndex) > 0) {
          trail.push({
            tag: el.tagName, cls: (el.className || "").slice(0, 80),
            pos: cs.position, z: cs.zIndex,
            rect: (function(){var r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height];})(),
          });
        }
        el = el.parentElement;
      }
      return trail;
    }, { x: cx, y: cy });
    log("positioned ancestors at that point: " + JSON.stringify(ancestors, null, 2));

    // Separately: is the notifications panel currently in the DOM?
    var panelState = await page.evaluate(function () {
      var p = document.querySelector(".cs-notif-panel");
      if (!p) return { present: false };
      var r = p.getBoundingClientRect();
      return { present: true, rect: [r.x, r.y, r.width, r.height] };
    });
    log("cs-notif-panel state: " + JSON.stringify(panelState));

    log("clicking bubble via page.mouse");
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, "04-after-bubble-click.png"), fullPage: true });

    var menuState = await page.evaluate(function () {
      var replyBtn = Array.from(document.querySelectorAll("button")).find(function (b) { return (b.innerText || "").trim() === "Reply"; });
      return { menuOpen: !!replyBtn };
    });
    log("action menu after left-click: " + JSON.stringify(menuState));

    if (!menuState.menuOpen) {
      // Dispatch native click directly on the bubble found by React fiber,
      // AND snapshot touchRef state before + after to see if suppression
      // is to blame.
      var evalClickResult = await page.evaluate(function () {
        var all = Array.from(document.querySelectorAll("div"));
        function propsOf(el) {
          var key = Object.keys(el).find(function (k) { return k.startsWith("__reactProps$"); });
          return key ? el[key] : null;
        }
        var bubbles = all.filter(function (d) {
          var p = propsOf(d);
          return p && typeof p.onTouchStart === "function" && typeof p.onClick === "function";
        });
        if (!bubbles.length) return { ok: false };
        var b = bubbles[bubbles.length - 1];
        // Dispatch a real mouse event — this matches what the browser does
        // on a real user click.
        var ev = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
        b.dispatchEvent(ev);
        return { ok: true, text: (b.innerText || "").slice(0, 30) };
      });
      log("fiber el.click(): " + JSON.stringify(evalClickResult));
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, "05-after-direct-click.png"), fullPage: true });
      var menuState2 = await page.evaluate(function () {
        var replyBtn = Array.from(document.querySelectorAll("button")).find(function (b) { return (b.innerText || "").trim() === "Reply"; });
        return { menuOpen: !!replyBtn };
      });
      log("action menu after direct click: " + JSON.stringify(menuState2));
    }
  }

  fs.writeFileSync(path.join(OUT, "console.json"), JSON.stringify(consoleMessages, null, 2));
  fs.writeFileSync(path.join(OUT, "errors.json"), JSON.stringify(pageErrors, null, 2));
  fs.writeFileSync(path.join(OUT, "net-errors.json"), JSON.stringify(netErrors, null, 2));
  log("console msgs: " + consoleMessages.length + "  |  page errors: " + pageErrors.length + "  |  net errors: " + netErrors.length);
  if (pageErrors.length) { log("errors: " + pageErrors.join("\n")); }
  var badMessages = consoleMessages.filter(function (m) { return m.type === "error" || m.type === "warning"; });
  if (badMessages.length) { log("bad console:"); badMessages.forEach(function (m) { log("  [" + m.type + "] " + m.text); }); }
  if (netErrors.length) {
    log("network failures:");
    netErrors.forEach(function (r) { log("  " + r.status + " " + r.url); });
  }

  await browser.close();
  log("done — screenshots in " + OUT);
}

main().catch(function (e) { console.error("FAIL:", e); process.exit(1); });
