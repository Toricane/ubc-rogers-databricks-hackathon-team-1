// Click-through check at 1280×720 with ?demo=1, using the locally installed Chrome or Edge.
// Usage: node scripts/ui-check.mjs [baseUrl] [screenshotDir]
import { chromium } from "playwright-core";
import fs from "node:fs";

const base = process.argv[2] ?? "http://localhost:5175/";
const outDir = process.argv[3];
const exe = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].find((p) => fs.existsSync(p));

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && !m.text().includes("404") && errors.push(m.text()));
const missing = [];
page.on("response", (r) => r.status() === 404 && missing.push(new URL(r.url()).pathname));

let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) failures++;
};
const headline = () => page.locator(".headline").first().innerText();
const badges = () => page.locator(".tab .badge").allInnerTexts();
const shot = async (name) => outDir && page.screenshot({ path: `${outDir}/${name}.png` });
const noScroll = async () =>
  page.evaluate(() => {
    const fits = (sel) => [...document.querySelectorAll(sel)].every((el) => {
      const r = el.getBoundingClientRect();
      return r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 && r.left >= -0.5;
    });
    return (
      document.documentElement.scrollHeight <= innerHeight &&
      document.documentElement.scrollWidth <= innerWidth &&
      document.querySelector(".app").scrollWidth <= innerWidth &&
      fits(".info-btn, .incident .btn, .btn-primary, .panel, .tabs, .incident")
    );
  });

await page.goto(`${base}?demo=1`);
await page.waitForSelector(".group-cards");
await page.waitForTimeout(1500);

check((await page.locator(".tab.active").innerText()).includes("Situation"), "demo opens on tab 1");
check((await page.locator(".incident .name").innerText()).includes("Aug 22"), "demo opens the aug22 incident");

const before = { badges: await badges() };
for (const k of ["1", "2", "3", "4", "5"]) {
  await page.keyboard.press(k);
  await page.waitForTimeout(600);
  const h = await headline();
  check(h.length > 0, `tab ${k} headline: ${h}`);
  check(await noScroll(), `tab ${k} fits 1280×720 with no page scroll`);
  await shot(`tab${k}-before`);
  if (k === "5") before.alert = await page.locator(".alert-box").inputValue();
}
await page.keyboard.press("1");
await page.waitForTimeout(300);
before.tab1 = await page.locator(".group-card.g-metro").innerText();

// Toggle Lions Gate and Ironworkers closed on tab 2.
await page.keyboard.press("2");
await page.waitForTimeout(500);
for (const name of ["Lions Gate Bridge", "Ironworkers Memorial Bridge"]) {
  await page.locator("tr", { hasText: name }).locator("button.toggle").click();
  await page.waitForTimeout(250);
  const txt = await page.locator("tr", { hasText: name }).innerText();
  check(txt.includes("Closed") && txt.includes("Set by officer"), `${name} shows ✕ Closed · Set by officer`);
}
check((await page.locator(".leaflet-marker-icon .xing.closed").count()) === 2, "map shows 2 closed crossing badges");
console.log("tab 2 headline:", await headline());
await shot("tab2-after");

const after = { badges: await badges() };
console.log("badges before:", before.badges.join(" | "), " after:", after.badges.join(" | "));
check(after.badges[1] === "2", "tab 2 badge shows 2 closed");
console.log("note: SeaBus is still open, so North Shore residents can still get home; tabs 1/3/4 only change once they are stranded");

await page.keyboard.press("1");
await page.waitForTimeout(400);
const tab1 = await page.locator(".group-card.g-metro").innerText();
console.log("tab 1 metro card:", tab1.replace(/\n/g, " "));
await shot("tab1-after");

await page.keyboard.press("3");
await page.waitForTimeout(600);
console.log("tab 3 headline:", await headline());
await shot("tab3-after");

await page.keyboard.press("4");
await page.waitForTimeout(400);
console.log("tab 4 headline:", await headline());
await shot("tab4-after");

await page.keyboard.press("5");
await page.waitForTimeout(400);
const alert = await page.locator(".alert-box").inputValue();
check(alert !== before.alert, "tab 5 alert text changed");
check(/North Vancouver|West Vancouver/.test(alert), "alert mentions the North Shore");
console.log("--- alert after ---\n" + alert + "\n---");
await shot("tab5-after");

// Close SeaBus too: the North Shore is now stranded, so tabs 1, 3, 4 must change.
await page.keyboard.press("2");
await page.waitForTimeout(300);
await page.locator("tr", { hasText: "SeaBus" }).locator("button.toggle").click();
await page.waitForTimeout(300);
const b3 = await badges();
console.log("badges with SeaBus also closed:", b3.join(" | "));
check(b3[2] !== after.badges[2], "tab 3 badge (stranded) changed once the North Shore has no way home");
await page.keyboard.press("1");
await page.waitForTimeout(300);
const tab1b = await page.locator(".group-card.g-metro").innerText();
check(tab1b !== before.tab1, `tab 1 metro card updated: ${tab1b.replace(/\n/g, " ")}`);
await shot("tab1-seabus");
await page.keyboard.press("3");
await page.waitForTimeout(500);
console.log("tab 3 headline:", await headline());
await shot("tab3-seabus");
await page.keyboard.press("4");
await page.waitForTimeout(300);
console.log("tab 4 headline:", await headline());
await shot("tab4-seabus");
await page.keyboard.press("5");
await page.waitForTimeout(300);
const alert3 = await page.locator(".alert-box").inputValue();
check(/North Vancouver and West Vancouver: crossings are closed/.test(alert3), "alert sends the North Shore to a hub");
console.log("--- alert with SeaBus closed ---\n" + alert3 + "\n---");

// Time stepping and the drawer.
const t0 = await page.locator(".time-val .time").innerText();
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(300);
check((await page.locator(".time-val .time").innerText()) !== t0, "→ steps the time");
await page.keyboard.press("ArrowLeft");
await page.locator(".info-btn").click();
await page.waitForTimeout(300);
check(await page.locator(".drawer").isVisible(), "(i) opens About this data");
await shot("drawer");

console.log("404s (expected: missing internal presence files -> mock fallback):", [...new Set(missing)].join(", ") || "none");
check(missing.every((p) => p.includes("/data/internal/")), "only internal presence files are missing");
for (const k of ["1", "2", "3", "4", "5"]) {
  await page.keyboard.press(k);
  await page.waitForTimeout(300);
  check(await noScroll(), `tab ${k} still fits after the toggles`);
}
check(errors.length === 0, `no console errors${errors.length ? ": " + errors.join(" / ") : ""}`);
await browser.close();
console.log(failures ? `${failures} check(s) failed` : "All UI checks passed");
process.exit(failures ? 1 : 0);
