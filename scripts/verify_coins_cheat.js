/* eslint-disable no-console */
const { chromium } = require("playwright");

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(page, fn, { timeoutMs = 30000, stepMs = 100 } = {}) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const ok = await page.evaluate(fn).catch(() => false);
    if (ok) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await sleep(stepMs);
  }
}

async function main() {
  const baseUrl = process.env.STACKTRIS_URL || "http://127.0.0.1:5173/index.html";

  const browser = await chromium.launch({
    headless: process.env.HEADED ? false : true,
    args: ["--use-gl=angle", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[page console.error]", msg.text());
  });
  page.on("pageerror", (err) => console.error("[pageerror]", String(err)));

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  // Wait for Emscripten FS and our cheat helpers to exist.
  await waitFor(page, () => typeof window.FS !== "undefined" && typeof window.__stacktrisToggleInfiniteCoins === "function");

  // Ensure the loader overlay isn't sitting above the webview (it can steal clicks in headless runs).
  await page.evaluate(() => {
    try {
      if (typeof window.hideOverlay === "function") {
        window.hideOverlay();
        return;
      }
    } catch (_e) {}
    const pc = document.getElementById("play_content");
    if (pc) pc.style.display = "none";
  });

  // Ensure a sandbox db exists (so the cheat can patch it deterministically for this test).
  await page.evaluate(async () => {
    function normWs(s) {
      return String(s || "").replace(/\s+/g, " ").trim();
    }
    if (!window.FS) throw new Error("FS missing");
    try {
      if (!FS.analyzePath("/sandbox").exists) FS.mkdir("/sandbox");
    } catch (_e) {
      // If mkdir fails because it exists or filesystem isn't ready, just continue.
    }
    const obj = { gc: { "61F77B7E06B4DC8D": { c: 15 } } };
    const txt = JSON.stringify(obj);
    const cs = new CompressionStream("deflate");
    const outAb = await new Response(new Blob([txt]).stream().pipeThrough(cs)).arrayBuffer();
    FS.writeFile("/sandbox/db", new Uint8Array(outAb));
    try {
      await new Promise((resolve) => FS.syncfs(false, () => resolve()));
    } catch (_e2) {}

    // Create a fake webview page containing "Stacktris Coins" as DOM text in a large clickable region.
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { margin: 0; font-family: sans-serif; }
      #wrap { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; }
      #area {
        width: min(720px, 92vw);
        height: 300px;
        background: #f1f5ff;
        border: 4px solid #1f4cff;
        border-radius: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 44px;
        user-select: none;
      }
      #area span { display: inline-block; }
    </style>
  </head>
  <body>
    <div id="wrap">
      <div id="area"><span>${normWs("Stacktris")}</span>&nbsp;<span>${normWs("Coins")}</span></div>
    </div>
    <script>window.__stacktrisCoinsAreaClicks = 0;</script>
  </body>
</html>`;
    FS.writeFile("/tmp_stacktris_coins_view.html", new TextEncoder().encode(html));

  });

  // Open the fake webview in the game's webview iframe.
  await page.evaluate(() => {
    if (typeof window.webViewOpen !== "function") throw new Error("webViewOpen missing");
    window.webViewOpen("/tmp_stacktris_coins_view.html");
  });

  // Wait for iframe and area element.
  await waitFor(page, () => {
    const iframe = document.querySelector("#webview_content iframe");
    if (!iframe || !iframe.contentWindow) return false;
    const doc = iframe.contentWindow.document;
    return !!doc && !!doc.querySelector("#area");
  });

  // Negative test: clicking outside the "Stacktris Coins" element must NOT increment the counter or toggle.
  await page.evaluate(async () => {
    try {
      if (typeof window.__stacktrisDisableInfiniteCoins === "function") await window.__stacktrisDisableInfiniteCoins();
    } catch (_e) {}
    try {
      window.__stacktrisIframeTapCount = 0;
      window.__stacktrisIframeTapFirstMs = 0;
      window.__stacktrisIframeTapLastMs = 0;
    } catch (_e2) {}
  });
  const outsidePt = await page.evaluate(() => {
    const iframe = window.webViewIframe || document.querySelector("#webview_content iframe");
    const ir = iframe.getBoundingClientRect();
    return { x: ir.left + 5, y: ir.top + 5 };
  });
  for (let i = 0; i < 15; i++) {
    await page.mouse.click(outsidePt.x, outsidePt.y, { delay: 10 });
    await sleep(25);
  }
  const outsideRes = await page.evaluate(() => ({
    inf: !!window.__stacktrisInfiniteCoins,
    taps: window.__stacktrisIframeTapCount || 0,
  }));
  if (outsideRes.inf || outsideRes.taps !== 0) {
    throw new Error(`Webview negative test failed: infinite=${outsideRes.inf} taps=${outsideRes.taps}`);
  }
  console.log("OK: webview negative test (outside clicks do not count).");

  async function clickAreaNTimes(n) {
    const pt = await page.evaluate(() => {
      const iframe = window.webViewIframe || document.querySelector("#webview_content iframe");
      const ir = iframe.getBoundingClientRect();
      const r = iframe.contentWindow.document.querySelector("#area").getBoundingClientRect();
      return { x: ir.left + r.left + r.width / 2, y: ir.top + r.top + r.height / 2 };
    });
    for (let i = 0; i < n; i++) {
      await page.mouse.click(pt.x, pt.y, { delay: 10 });
      await sleep(25);
    }
  }

  // Ensure our cheat listener does not break normal clicks inside the webview.
  await page.evaluate(() => {
    const iframe = window.webViewIframe || document.querySelector("#webview_content iframe");
    if (!iframe || !iframe.contentWindow) throw new Error("iframe missing");
    iframe.contentWindow.__stacktrisCoinsAreaClicks = 0;
    const area = iframe.contentWindow.document.querySelector("#area");
    if (!area) throw new Error("area missing");
    area.addEventListener("click", () => {
      iframe.contentWindow.__stacktrisCoinsAreaClicks++;
    });
  });
  await clickAreaNTimes(1);
  const clickPassthrough = await page.evaluate(() => {
    const iframe = window.webViewIframe || document.querySelector("#webview_content iframe");
    return iframe && iframe.contentWindow ? iframe.contentWindow.__stacktrisCoinsAreaClicks || 0 : 0;
  });
  if (clickPassthrough !== 1) {
    throw new Error(`Webview click passthrough failed: got ${clickPassthrough} clicks`);
  }
  console.log("OK: webview click passthrough (cheat listener does not block clicks).");

  // Validate the webview DOM trigger (matches the user-facing "Stacktris Coins" prompt).
  await page.evaluate(async () => {
    try {
      if (typeof window.__stacktrisDisableInfiniteCoins === "function") await window.__stacktrisDisableInfiniteCoins();
    } catch (_e) {}
  });
  await clickAreaNTimes(10);
  await waitFor(
    page,
    () => {
      try {
        return window.__stacktrisInfiniteCoins === true;
      } catch (_e) {
        return false;
      }
    },
    { timeoutMs: 5000 }
  );
  await clickAreaNTimes(10);
  await waitFor(
    page,
    () => {
      try {
        return window.__stacktrisInfiniteCoins === false;
      } catch (_e) {
        return false;
      }
    },
    { timeoutMs: 5000 }
  );
  console.log("OK: webview 'Stacktris Coins' arming works (10 taps toggles).");

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
