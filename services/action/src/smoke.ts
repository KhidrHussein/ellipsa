import { chromium } from "playwright";

async function main() {
  const url = process.env.SMOKE_URL ?? "https://mail.google.com/";
  console.log(`[smoke] launching headless Chromium to ${url}`);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    const resp = await page.goto(url, { timeout: 30000, waitUntil: "domcontentloaded" });
    console.log("[smoke] status:", resp?.status());
    // capture a tiny screenshot artifact
    await page.screenshot({ path: "smoke.png", fullPage: false });
    console.log("[smoke] screenshot saved to smoke.png");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("[smoke] error:", e);
  process.exit(1);
});
