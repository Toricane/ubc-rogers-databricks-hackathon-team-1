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
check(await page.locator(".splash").isVisible(), "splash shows on load");
await page.keyboard.press("Space"); // any key skips it
await page.waitForSelector(".splash", { state: "detached", timeout: 3000 });
await page.waitForSelector(".group-cards");
await page.waitForTimeout(1500);

// Displayed totals must equal the gold totals recorded by the export.
const manifest = await (await fetch(new URL("data/internal/manifest.json", base))).json().catch(() => null);
const shownTotal = async () => Number((await page.locator(".headline .num").first().innerText()).replace(/,/g, ""));
const goldAt = (date, slot) => manifest?.days?.[date]?.gold_totals?.[slot];
check(!!manifest, "manifest.json is served");
check((await page.locator(".source-badge").count()) === 0, "no data-source badge in the header");
check((await page.title()) === "Cell-Safe", "page title is Cell-Safe");
check((await page.locator(".mock-badge").count()) === 0, "no Mock data badge");
check((await page.locator("path.home-circle").count()) > 0, "home-area circles carry their group colour class");
{
  const g = goldAt("2026-07-22", "17:00");
  const v = await shownTotal();
  check(v === g, `Jul 22 17:00 shows ${v}; gold total_count ${g}`);
}

check((await page.locator(".tab.active").innerText()).includes("Situation"), "demo opens on tab 1");
check((await page.locator(".time-step .day").textContent()) === "Wed, Jul 22", "the day is Wed, Jul 22");
check((await page.locator(".incident-text .name").innerText()).includes("Heat and wildfire smoke"), "weather is heat and smoke");

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

// Change weather: supplies follow the hazard.
await page.keyboard.press("4");
await page.waitForTimeout(300);
const heatItems = await page.locator(".totals-card td:first-child").allInnerTexts();
check(heatItems.includes("N95 masks") && !heatItems.includes("Blankets"), `heat supplies: ${[...new Set(heatItems)].join(", ")}`);
await page.locator("button", { hasText: "Change weather" }).click();
await page.locator(".weather-option", { hasText: "Lightning storm" }).click();
await page.locator("button", { hasText: "Use this weather" }).click();
await page.waitForTimeout(400);
const ltItems = await page.locator(".totals-card td:first-child").allInnerTexts();
check(ltItems.includes("Blankets") && !ltItems.includes("N95 masks"), `lightning supplies: ${[...new Set(ltItems)].join(", ")}`);
check((await page.locator(".time-step .day").textContent()) === "Wed, Jul 22", "changing weather keeps the day");
await page.locator("button", { hasText: "Change weather" }).click();
await page.locator(".weather-option", { hasText: "Heat and wildfire smoke" }).click();
await page.locator("button", { hasText: "Use this weather" }).click();
await page.waitForTimeout(300);

// Time stepping and the drawer.
const t0 = await page.locator(".time-step .time").innerText();
await page.keyboard.press("1");
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(500);
check((await page.locator(".time-step .time").innerText()) === "17:30", "→ steps the time to 17:30");
check((await shownTotal()) === goldAt("2026-07-22", "17:30"), `17:30 total matches gold (${goldAt("2026-07-22", "17:30")})`);
for (let i = 0; i < 14; i++) await page.keyboard.press("ArrowRight");
await page.waitForTimeout(600);
check((await page.locator(".time-step .time").innerText()) === "00:30", "stepping past midnight reaches 00:30");
check((await page.locator(".time-step .day").textContent()) === "Thu, Jul 23", "the day rolls to Thu, Jul 23");
check((await shownTotal()) === goldAt("2026-07-23", "00:30"), `Jul 23 00:30 total matches gold (${goldAt("2026-07-23", "00:30")})`);
for (let i = 0; i < 15; i++) await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(600);
await page.locator(".info-btn").click();
await page.waitForTimeout(300);
check(await page.locator(".drawer").isVisible(), "(i) opens About this data");
await shot("drawer");

check(missing.length === 0, `no missing files${missing.length ? ": " + missing.join(", ") : ""}`);

// Time stays inside the scenario day: stepping back stops at Wed, Jul 22 00:00.
await page.keyboard.press("Escape");
await page.keyboard.press("1");
for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(800);
check(
  (await page.locator(".time-step .day").textContent()) === "Wed, Jul 22" && (await page.locator(".time-step .time").innerText()) === "00:00",
  "← stops at Wed, Jul 22 00:00",
);
check(await page.locator('button[aria-label="30 minutes earlier"]').isDisabled(), "earlier button is disabled at the start of the day");
check((await shownTotal()) === goldAt("2026-07-22", "00:00"), `00:00 total matches gold (${goldAt("2026-07-22", "00:00")})`);
await shot("day-start");
for (const k of ["1", "2", "3", "4", "5"]) {
  await page.keyboard.press(k);
  await page.waitForTimeout(300);
  check(await noScroll(), `tab ${k} still fits after the toggles`);
}
check(errors.length === 0, `no console errors${errors.length ? ": " + errors.join(" / ") : ""}`);
await browser.close();
console.log(failures ? `${failures} check(s) failed` : "All UI checks passed");
process.exit(failures ? 1 : 0);
