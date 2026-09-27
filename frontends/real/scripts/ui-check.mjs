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
const xrow = (name) => page.locator(".xing-table tr", { hasText: name });
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
// Per-minute gold totals from the --minutes export (fall back to the 30-minute export at :00 and :30).
const goldAt = (date, time) => {
  const [h, mi] = time.split(":").map(Number);
  return manifest?.minutes?.days?.[date]?.gold_totals?.[h * 60 + mi] ?? manifest?.days?.[date]?.gold_totals?.[time];
};
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
// Zoom buttons: + and − on the map, and the map opens zoomed in on Waterfront.
{
  check(await page.locator(".leaflet-control-zoom-in").isVisible() && await page.locator(".leaflet-control-zoom-out").isVisible(), "map shows + and − zoom buttons");
  const scaleOf = () => page.locator(".leaflet-tile-pane .leaflet-layer > .leaflet-tile-container").last().evaluate((el) => el.style.transform || "").catch(() => "");
  const tilesBefore = await page.locator(".leaflet-tile").first().getAttribute("src").catch(() => null);
  await page.locator(".leaflet-control-zoom-in").click();
  await page.waitForTimeout(700);
  const tilesAfter = await page.locator(".leaflet-tile").first().getAttribute("src").catch(() => null);
  check(tilesBefore === null || tilesAfter !== tilesBefore, "clicking + zooms the map in");
  await page.locator(".leaflet-control-zoom-out").click();
  await page.waitForTimeout(700);
  const wf = await page.locator(".wf-icon").first().boundingBox();
  const mb = await page.locator(".map-wrap").first().boundingBox();
  const cx = mb.x + mb.width / 2, cy = mb.y + mb.height / 2;
  check(Math.abs(wf.x + wf.width / 2 - cx) < 40 && Math.abs(wf.y + wf.height / 2 - cy) < 40, "map opens centred on Waterfront");
}

// Hovering a KPI highlights that group on the map.
{
  const fillOf = (sel) => page.locator(sel).first().evaluate((el) => Number(getComputedStyle(el).fillOpacity));
  await page.locator(".stat-metro").hover();
  await page.waitForTimeout(300);
  check((await page.locator(".map-wrap").getAttribute("data-focus")) === "metro", "hovering Metro focuses the map on Metro");
  const metroOn = await fillOf("path.home-circle.g-metro");
  const vanOff = await fillOf("path.home-circle.g-vancouver");
  check(metroOn > 0.8 && vanOff < 0.3, `Metro circles stand out (${metroOn}) and Vancouver fades (${vanOff})`);
  await shot("hover-metro");
  await page.locator(".stat-outside").hover();
  await page.waitForTimeout(300);
  check(await page.locator(".region-panel.is-focus").count() === 1, "hovering Outside Metro highlights the region table");
  await page.mouse.move(640, 690);
  await page.waitForTimeout(300);
  check((await page.locator(".map-wrap").getAttribute("data-focus")) === null, "moving away clears the highlight");
  const colour = await page.locator(".stat-vancouver .stat-value").evaluate((el) => getComputedStyle(el).color);
  check(colour !== "rgb(17, 17, 19)", `Vancouver number is coloured (${colour})`);
}
{
  const bar = (await page.locator(".alert-bar").textContent()) ?? "";
  check(bar.includes("Heat warning in effect") && bar.includes("humidex up to 42°C"), `heat warning bar under the headline: ${bar}`);
}
check((await page.locator(".group-card", { hasText: "Outside Metro" }).innerText()).toLowerCase().includes("need a cooling / cleaner-air space"), "heat: Outside Metro needs a cooling / cleaner-air space");
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
before.tab1 = await page.locator(".group-card").nth(1).innerText();

// Toggle Lions Gate and Ironworkers closed on tab 2 (Getting home).
await page.keyboard.press("2");
await page.waitForTimeout(500);
for (const name of ["Lions Gate Bridge", "Ironworkers Memorial Bridge"]) {
  await xrow(name).locator("button.toggle").click();
  await page.waitForTimeout(250);
  const txt = await xrow(name).innerText();
  check(txt.includes("Closed") && txt.includes("Set by officer"), `${name} shows ✕ Closed · Set by officer`);
}
check((await page.locator(".leaflet-marker-icon .xing.closed").count()) === 2, "map shows 2 closed crossing badges");
console.log("tab 2 headline:", await headline());
await shot("tab2-after");

const after = { badges: await badges() };
console.log("badges before:", before.badges.join(" | "), " after:", after.badges.join(" | "));
// Tab 2's badge is people who can get home (Vancouver + Metro with an open crossing). Lions Gate and
// Ironworkers are closed, but SeaBus (also on North/West Van's crossing list) is still open, so nobody
// is actually stranded yet and the badge is unchanged.
check(after.badges[1] === before.badges[1], `tab 2 badge unchanged while SeaBus stays open (${after.badges[1]})`);
console.log("note: SeaBus is still open, so North Shore residents can still get home; tabs 1/3/4 only change once they are stranded");

await page.keyboard.press("1");
await page.waitForTimeout(400);
const tab1 = await page.locator(".group-card").nth(1).innerText();
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
await xrow("SeaBus").locator("button.toggle").click();
await page.waitForTimeout(300);
const b3 = await badges();
console.log("badges with SeaBus also closed:", b3.join(" | "));
check(b3[2] !== after.badges[2], "tab 3 badge (stranded) changed once the North Shore has no way home");
await page.keyboard.press("1");
await page.waitForTimeout(300);
const tab1b = await page.locator(".group-card").nth(1).innerText();
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
check(heatItems.includes("N95 masks") && !heatItems.includes("Blankets") && !heatItems.includes("Cots"), `heat supplies (no cots): ${[...new Set(heatItems)].join(", ")}`);
await page.keyboard.press("3");
await page.waitForTimeout(300);
check((await headline()).includes("to cooling spaces"), `heat tab 3 headline: ${await headline()}`);
await page.keyboard.press("4");
await page.waitForTimeout(300);
await page.locator("button", { hasText: "Change weather" }).click();
await page.locator(".weather-option", { hasText: "Lightning storm" }).click();
await page.locator("button", { hasText: "Use this weather" }).click();
await page.waitForTimeout(400);
const ltItems = await page.locator(".totals-card td:first-child").allInnerTexts();
check(ltItems.includes("Blankets") && ltItems.includes("Cots") && !ltItems.includes("N95 masks"), `lightning supplies: ${[...new Set(ltItems)].join(", ")}`);
await page.keyboard.press("1");
await page.waitForTimeout(300);
check((await page.locator(".group-card", { hasText: "Outside Metro" }).innerText()).toLowerCase().includes("need overnight lodging"), "lightning: Outside Metro needs overnight lodging");
check((await page.locator(".alert-bar").count()) === 0, "no heat warning bar for lightning");
await page.keyboard.press("3");
await page.waitForTimeout(300);
check(/Send [\d,]+ people to \d+ hubs?\./.test(await headline()), `lightning tab 3 headline: ${await headline()}`);
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
check((await page.locator(".time-step .time").innerText()) === "17:01", "→ steps one minute to 17:01");
check((await shownTotal()) === goldAt("2026-07-22", "17:01"), `17:01 total matches gold minute (${goldAt("2026-07-22", "17:01")})`);
await page.keyboard.press("ArrowLeft");

// Drag the slider to 20:34 (minute 1234).
await page.locator(".time-slider input").evaluate((el, v) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  set.call(el, String(v));
  el.dispatchEvent(new Event("input", { bubbles: true }));
}, 1234);
await page.waitForTimeout(500);
check((await page.locator(".time-step .time").innerText()) === "20:34", "slider picks 20:34");
check((await shownTotal()) === goldAt("2026-07-22", "20:34"), `20:34 total matches gold minute (${goldAt("2026-07-22", "20:34")})`);
await shot("slider-2034");
await page.locator(".time-slider input").evaluate((el) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  set.call(el, "1020");
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.waitForTimeout(400);

for (let i = 0; i < 15; i++) await page.keyboard.press("Shift+ArrowRight");
await page.waitForTimeout(600);
check((await page.locator(".time-step .time").innerText()) === "00:30", "stepping past midnight reaches 00:30");
check((await page.locator(".time-step .day").textContent()) === "Thu, Jul 23", "the day rolls to Thu, Jul 23");
check((await shownTotal()) === goldAt("2026-07-23", "00:30"), `Jul 23 00:30 total matches gold (${goldAt("2026-07-23", "00:30")})`);
for (let i = 0; i < 15; i++) await page.keyboard.press("Shift+ArrowLeft");
await page.waitForTimeout(600);
await page.locator(".info-btn").click();
await page.waitForTimeout(300);
check(await page.locator(".drawer").isVisible(), "(i) opens About this data");
await shot("drawer");

check(missing.length === 0, `no missing files${missing.length ? ": " + missing.join(", ") : ""}`);

// Time stays inside the scenario day: stepping back stops at Wed, Jul 22 00:00.
await page.keyboard.press("Escape");
await page.keyboard.press("1");
for (let i = 0; i < 40; i++) await page.keyboard.press("Shift+ArrowLeft");
await page.waitForTimeout(800);
check(
  (await page.locator(".time-step .day").textContent()) === "Wed, Jul 22" && (await page.locator(".time-step .time").innerText()) === "00:00",
  "← stops at Wed, Jul 22 00:00",
);
check(await page.locator('button[aria-label="1 minute earlier"]').isDisabled(), "earlier button is disabled at the start of the day");
check((await shownTotal()) === goldAt("2026-07-22", "00:00"), `00:00 total matches gold (${goldAt("2026-07-22", "00:00")})`);
await shot("day-start");
for (const k of ["1", "2", "3", "4", "5"]) {
  await page.keyboard.press(k);
  await page.waitForTimeout(300);
  check(await noScroll(), `tab ${k} still fits after the toggles`);
}
// Jul 22 17:00 with SeaBus closed: North Vancouver moves to a scheduled bus over an open bridge, with a bus count.
// Reload for a clean state (all crossings open); the demo opens on Jul 22 17:00.
await page.goto(`${base}?demo=1`);
await page.keyboard.press("Space");
await page.waitForSelector(".splash", { state: "detached", timeout: 3000 });
await page.waitForSelector(".group-cards");
await page.waitForTimeout(800);
check((await page.locator(".time-step .time").innerText()) === "17:00", "Jul 22 opens at 17:00");
await page.keyboard.press("2");
await page.waitForTimeout(800);
check((await page.locator(".route-line").count()) > 0, "tab 2 draws scheduled routes home");
check((await page.locator(".origin-dot").count()) > 0, "tab 2 draws home-area dots");
// Zoom in first: toggling a crossing must keep the officer's view and the map box size.
{
  const mb = await page.locator(".map-wrap").boundingBox();
  await page.mouse.move(mb.x + mb.width * 0.4, mb.y + mb.height * 0.35);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(900);
}
const mapBefore = await page.locator(".map-wrap").boundingBox();
const pinBefore = await page.locator(".wf-pin").first().boundingBox();
await xrow("SeaBus").locator("button.toggle").click();
await page.waitForTimeout(600);
const pinAfter = await page.locator(".wf-pin").first().boundingBox();
check(
  !!pinBefore && !!pinAfter && Math.abs(pinBefore.x - pinAfter.x) < 1 && Math.abs(pinBefore.y - pinAfter.y) < 1,
  "map does not move or zoom when a crossing is toggled",
);
const mapAfter = await page.locator(".map-wrap").boundingBox();
check(!!mapBefore && !!mapAfter && Math.abs(mapBefore.height - mapAfter.height) < 1, "map box keeps its size when a crossing is toggled");
// Back to the default view for the checks and screenshot below.
await page.keyboard.press("1");
await page.waitForTimeout(300);
await page.keyboard.press("2");
await page.waitForTimeout(800);
const nv = await page.locator(".bus-table tr.row-divert", { hasText: "North Vancouver" }).innerText().catch(() => "");
console.log("North Vancouver row:", nv.replace(/\s+/g, " "));
check(/Via/.test(nv) && /\d/.test(nv.split("\t")[4] ?? nv), "North Vancouver is diverted with a bus count");
const chip = page.locator(".route-chip.diverted").first();
const label = await chip.innerText().catch(() => "");
check(/\d+ bus(es)? → North Vancouver/.test(label), `diverted chip names buses and home area: ${label}`);
// The chip sits at the route's end (home-area side), well away from the Waterfront pin.
const cb = await chip.boundingBox();
const wb = await page.locator(".wf-pin").first().boundingBox();
const dist = cb && wb ? Math.hypot(cb.x - wb.x, cb.y - wb.y) : 0;
check(dist > 80, `diverted chip is ${Math.round(dist)} px from Waterfront (> 80)`);
const chipCount = await page.locator(".route-chip").count();
check(chipCount >= 2, `bus-route home areas have chips (${chipCount}); normal rail lines are named by their home-area label`);
check((await page.locator(".route-casing").count()) > 0, "diverted route has a white casing");
console.log("tab 2 headline (Jul 22, SeaBus closed):", await headline());
check(/SeaBus closed: send \d+ bus/.test(await headline()), "headline names the buses to send");
check(await noScroll(), "tab 2 fits with routes and bus table");
await shot("tab2-jul22-seabus");

check(errors.length === 0, `no console errors${errors.length ? ": " + errors.join(" / ") : ""}`);
await browser.close();
console.log(failures ? `${failures} check(s) failed` : "All UI checks passed");
process.exit(failures ? 1 : 0);
