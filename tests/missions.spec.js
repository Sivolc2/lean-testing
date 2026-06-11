// Playwright tests for the Epstein-drive transit visualizer.
// Validates the mission picker, the numbers panel (against the JSON), ship
// animation, the drive-phase indicator, and the core controls.
const { test, expect } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');

function startServer(dir, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let filePath = path.normalize(path.join(dir, req.url === '/' ? 'index.html' : req.url));
      if (!filePath.startsWith(dir)) { res.writeHead(403); res.end('Forbidden'); return; }
      const ext = path.extname(filePath).toLowerCase();
      const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' }[ext] || 'application/octet-stream';
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': mime }); res.end(data);
      });
    });
    server.listen(port, 'localhost', () => resolve(server));
    server.on('error', reject);
  });
}

let server;
const PORT = 9877;
const DIR = path.join(__dirname, '..', 'visualizer');
const URL = `http://localhost:${PORT}/`;

async function waitLoaded(page) {
  await page.waitForFunction(() => {
    const l = document.getElementById('loading');
    return window._sim && window._sim.mission && l && l.style.display === 'none';
  }, { timeout: 30000 });
}

test.beforeAll(async () => { server = await startServer(DIR, PORT); });
test.afterAll(async () => { if (server) server.close(); });

test.describe('Epstein-drive transit visualizer', () => {

  test('1. loads with no console errors and has missions', async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(URL);
    await waitLoaded(page);
    const n = await page.evaluate(() => window._sim.data.missions.length);
    expect(n).toBeGreaterThan(0);
    const critical = errors.filter(e => !e.includes('favicon') && !e.includes('404'));
    expect(critical, critical.join(', ')).toHaveLength(0);
  });

  test('2. route and drive pickers are populated from data', async ({ page }) => {
    await page.goto(URL); await waitLoaded(page);
    const routeBtns = await page.locator('.route-btn').count();
    const driveBtns = await page.locator('.drive-btn').count();
    const counts = await page.evaluate(() => {
      const routes = new Set(window._sim.data.missions.map(m => m.from + '→' + m.to));
      return { routes: routes.size, drives: window._sim.data.drives.length };
    });
    expect(routeBtns).toBe(counts.routes);
    expect(driveBtns).toBe(counts.drives);
  });

  test('3. canvas is visible and sized', async ({ page }) => {
    await page.goto(URL); await waitLoaded(page);
    const box = await page.locator('#simCanvas').boundingBox();
    expect(box.width).toBeGreaterThan(200);
    expect(box.height).toBeGreaterThan(200);
  });

  test('4. numbers panel matches the selected mission JSON', async ({ page }) => {
    await page.goto(URL); await waitLoaded(page);
    // Select Ceres→Saturn + Epstein 1g explicitly
    await page.locator('.route-btn[data-route="Ceres→Saturn"]').click();
    await page.locator('.drive-btn[data-drive="ep1"]').click();
    await page.waitForTimeout(150);

    const m = await page.evaluate(() => window._sim.mission);
    expect(m.id).toBe('Ceres-Saturn-ep1');
    expect(m.isHohmann).toBe(false);

    const peak = await page.locator('#np-peakv').textContent();
    expect(parseInt(peak.replace(/[^0-9]/g, ''))).toBe(Math.round(m.peakVelKms));
    const accel = await page.locator('#np-accel').textContent();
    expect(accel).toContain(String(m.accelG));
    const speedup = await page.locator('#np-speedup').textContent();
    expect(parseInt(speedup.replace(/[^0-9]/g, ''))).toBe(Math.round(m.speedupFactor));
    // speedup badge visible for Epstein
    await expect(page.locator('#np-speedup-box')).toBeVisible();
  });

  test('5. chemical drive shows Δv and hides the speedup badge', async ({ page }) => {
    await page.goto(URL); await waitLoaded(page);
    await page.locator('.route-btn[data-route="Earth→Mars"]').click();
    await page.locator('.drive-btn[data-drive="chem"]').click();
    await page.waitForTimeout(150);

    const m = await page.evaluate(() => window._sim.mission);
    expect(m.isHohmann).toBe(true);
    const dv = await page.locator('#np-dv').textContent();
    expect(dv).toContain('km/s');
    expect(parseFloat(dv)).toBeCloseTo(m.deltaVKms, 1);
    await expect(page.locator('#np-speedup-box')).toBeHidden();
    await expect(page.locator('#np-baseline-note')).toBeVisible();
    // transit should read in days/years (long), not hours
    const transit = await page.locator('#np-transit').textContent();
    expect(transit).toMatch(/days|yr/);
  });

  test('6. switching to Epstein drops transit time dramatically', async ({ page }) => {
    await page.goto(URL); await waitLoaded(page);
    await page.locator('.route-btn[data-route="Earth→Mars"]').click();
    await page.locator('.drive-btn[data-drive="chem"]').click();
    await page.waitForTimeout(100);
    const chemDays = await page.evaluate(() => window._sim.mission.transitDays);
    await page.locator('.drive-btn[data-drive="ep3"]').click();
    await page.waitForTimeout(100);
    const epDays = await page.evaluate(() => window._sim.mission.transitDays);
    expect(epDays).toBeLessThan(chemDays / 10);
  });

  test('7. ship animates and phase indicator advances on an Epstein hop', async ({ page }) => {
    await page.goto(URL); await waitLoaded(page);
    await page.locator('.route-btn[data-route="Earth→Mars"]').click();
    await page.locator('.drive-btn[data-drive="ep1"]').click();
    await page.waitForTimeout(100);
    const pos0 = await page.evaluate(() => window._sim.mission.frames[0].shipPos.slice());
    await page.waitForTimeout(600);
    const fIdx = await page.evaluate(() => { /* read live frame */ return null; });
    // ship position in the live frame should differ from frame 0
    const moved = await page.evaluate(p0 => {
      // find a later frame's ship pos by reading the scrub slider value
      const idx = parseInt(document.getElementById('scrub-slider').value);
      const sp = window._sim.mission.frames[idx].shipPos;
      return Math.hypot(sp[0] - p0[0], sp[1] - p0[1]);
    }, pos0);
    expect(moved).toBeGreaterThan(0);
    // phase indicator shows one of the burn phases at some point
    const phaseText = await page.locator('#phase-indicator').textContent();
    expect(['ACCELERATING ▲', 'FLIP & BURN ⟲', 'DECELERATING ▼']).toContain(phaseText);
  });

  test('8. play/pause toggles', async ({ page }) => {
    await page.goto(URL); await waitLoaded(page);
    const btn = page.locator('#play-btn');
    expect(await btn.textContent()).toContain('PAUSE');
    await btn.click();
    expect(await btn.textContent()).toContain('PLAY');
    await btn.click();
    expect(await btn.textContent()).toContain('PAUSE');
  });

  test('9. scrub slider changes the frame', async ({ page }) => {
    await page.goto(URL); await waitLoaded(page);
    await page.locator('#play-btn').click(); // pause
    const scrub = page.locator('#scrub-slider');
    await scrub.evaluate(el => { el.value = Math.floor(el.max / 2); el.dispatchEvent(new Event('input')); });
    await page.waitForTimeout(100);
    const idx = await page.evaluate(() => parseInt(document.getElementById('scrub-slider').value));
    expect(idx).toBeGreaterThan(0);
  });

  test('10. speed slider changes speed label', async ({ page }) => {
    await page.goto(URL); await waitLoaded(page);
    const slider = page.locator('#speed-slider');
    await slider.evaluate(el => { el.value = 100; el.dispatchEvent(new Event('input')); });
    const fast = await page.locator('#speed-label').textContent();
    await slider.evaluate(el => { el.value = 0; el.dispatchEvent(new Event('input')); });
    const slow = await page.locator('#speed-label').textContent();
    expect(fast).not.toBe(slow);
  });

  test('11. screenshot for visual review', async ({ page }) => {
    await page.goto(URL); await waitLoaded(page);
    await page.locator('.route-btn[data-route="Ceres→Saturn"]').click();
    await page.locator('.drive-btn[data-drive="ep1"]').click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(__dirname, 'screenshot.png') });
    expect(fs.existsSync(path.join(__dirname, 'screenshot.png'))).toBe(true);
  });

});

test.describe('Revamp features', () => {

  test('12. Earth→Ceres Belter route is in the picker', async ({ page }) => {
    await page.goto(URL); await waitLoaded(page);
    await expect(page.locator('.route-btn[data-route="Earth→Ceres"]')).toBeVisible();
    const n = await page.locator('.route-btn').count();
    expect(n).toBeGreaterThanOrEqual(5);
  });

  test('13. live telemetry matches a finite-difference of the frames', async ({ page }) => {
    await page.goto(URL); await waitLoaded(page);
    await page.locator('.route-btn[data-route="Earth→Mars"]').click();
    await page.locator('.drive-btn[data-drive="ep1"]').click();
    await page.locator('#play-btn').click(); // pause
    // scrub to mid-flight
    await page.locator('#scrub-slider').evaluate(el => {
      el.value = Math.floor(el.max / 2); el.dispatchEvent(new Event('input'));
    });
    await page.waitForTimeout(150);

    const { expected, shown } = await page.evaluate(() => {
      const fs = window._sim.mission.frames;
      const i = parseInt(document.getElementById('scrub-slider').value);
      const j0 = Math.max(0, i - 1), j1 = Math.min(fs.length - 1, i + 1);
      const a = fs[j0].shipPos, b = fs[j1].shipPos;
      const v = Math.hypot(b[0] - a[0], b[1] - a[1]) / (fs[j1].t - fs[j0].t) / 1000;
      return { expected: v, shown: window._sim.telemetry.velKms };
    });
    expect(shown).toBeCloseTo(expected, 3);

    // displayed text agrees with the telemetry object
    const curvText = await page.locator('#np-curv').textContent();
    expect(curvText).toContain('km/s');
    expect(parseFloat(curvText.replace(/,/g, ''))).toBeCloseTo(expected, 0);
    // mid-burn at 1 g a ship is going a meaningful fraction of c
    await expect(page.locator('#np-lightc')).toContainText('% c');
    await expect(page.locator('#np-dist')).toContainText('AU');
    await expect(page.locator('#np-remain')).toContainText('AU');
  });

  test('14. race strip shows for Epstein, hides for chemical, and Epstein leads', async ({ page }) => {
    await page.goto(URL); await waitLoaded(page);
    await page.locator('.route-btn[data-route="Ceres→Saturn"]').click();
    await page.locator('.drive-btn[data-drive="ep1"]').click();
    await page.waitForTimeout(800); // let it fly a bit
    await expect(page.locator('#race-strip')).toBeVisible();

    const widths = await page.evaluate(() => ({
      ep: parseFloat(document.getElementById('race-ep-fill').style.width),
      chem: parseFloat(document.getElementById('race-chem-fill').style.width),
    }));
    expect(widths.ep).toBeGreaterThan(0);
    expect(widths.ep).toBeGreaterThan(widths.chem); // the whole point of the talk
    await expect(page.locator('#race-chem-pct')).toContainText('of');

    await page.locator('.drive-btn[data-drive="chem"]').click();
    await expect(page.locator('#race-strip')).toBeHidden();
  });

  test('15. catalog overlay lists every mission and selects on click', async ({ page }) => {
    await page.goto(URL); await waitLoaded(page);
    await page.locator('#catalog-btn').click();
    await expect(page.locator('#catalog-overlay')).toBeVisible();

    const counts = await page.evaluate(() => ({
      rows: document.querySelectorAll('#catalog-body tr[data-mission-id]').length,
      heads: document.querySelectorAll('#catalog-body tr.route-head').length,
      missions: window._sim.data.missions.length,
      routes: new Set(window._sim.data.missions.map(m => m.from + '→' + m.to)).size,
    }));
    expect(counts.rows).toBe(counts.missions);
    expect(counts.heads).toBe(counts.routes);

    // current mission row is highlighted
    const current = await page.locator('#catalog-body tr.current').getAttribute('data-mission-id');
    expect(current).toBe(await page.evaluate(() => window._sim.mission.id));

    // clicking a row flies that mission and closes the overlay
    await page.locator('#catalog-body tr[data-mission-id="Earth-Jupiter-ep3"]').click();
    await expect(page.locator('#catalog-overlay')).toBeHidden();
    expect(await page.evaluate(() => window._sim.mission.id)).toBe('Earth-Jupiter-ep3');
    await expect(page.locator('#np-route')).toHaveText('Earth → Jupiter');
  });

  test('16. keyboard shortcuts: space, C/Escape, F follow, arrow scrub', async ({ page }) => {
    await page.goto(URL); await waitLoaded(page);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());

    // space toggles play
    await page.keyboard.press('Space');
    await expect(page.locator('#play-btn')).toContainText('PLAY');
    await page.keyboard.press('Space');
    await expect(page.locator('#play-btn')).toContainText('PAUSE');

    // C opens the catalog, Escape closes it
    await page.keyboard.press('c');
    await expect(page.locator('#catalog-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#catalog-overlay')).toBeHidden();

    // F toggles follow-ship
    await page.keyboard.press('f');
    await expect(page.locator('#follow-btn')).toHaveClass(/active/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#follow-btn')).not.toHaveClass(/active/);

    // arrow keys pause and step the frame
    const v0 = await page.evaluate(() => parseInt(document.getElementById('scrub-slider').value));
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#play-btn')).toContainText('PLAY'); // paused by arrow
    const v1 = await page.evaluate(() => parseInt(document.getElementById('scrub-slider').value));
    expect(v1).toBe((v0 + 1) % 241);
  });

  test('17. phase strip renders the burn timeline as a gradient', async ({ page }) => {
    await page.goto(URL); await waitLoaded(page);
    await page.locator('.drive-btn[data-drive="ep1"]').click();
    const bg = await page.locator('#phase-strip').evaluate(el => el.style.background);
    expect(bg).toContain('linear-gradient');
    // Epstein timeline contains both the accel and decel colors
    expect(bg).toContain('255, 176, 96');  // #ffb060 accel
    expect(bg).toContain('102, 192, 255'); // #66c0ff decel
  });

  test('18. screenshots: chemical transfer and catalog overlay', async ({ page }) => {
    await page.goto(URL); await waitLoaded(page);
    await page.locator('.route-btn[data-route="Earth→Mars"]').click();
    await page.locator('.drive-btn[data-drive="chem"]').click();
    await page.locator('#play-btn').click(); // pause
    await page.locator('#scrub-slider').evaluate(el => {
      el.value = Math.floor(el.max * 0.55); el.dispatchEvent(new Event('input'));
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(__dirname, 'screenshot-chemical.png') });

    await page.locator('#catalog-btn').click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(__dirname, 'screenshot-catalog.png') });
    expect(fs.existsSync(path.join(__dirname, 'screenshot-chemical.png'))).toBe(true);
    expect(fs.existsSync(path.join(__dirname, 'screenshot-catalog.png'))).toBe(true);
  });

  test('19. math panel shows the right equations and they reproduce the Lean result', async ({ page }) => {
    await page.goto(URL); await waitLoaded(page);

    // Epstein: brachistochrone form, and t = 2·√(d/a) matches the mission's transit
    await page.locator('.route-btn[data-route="Earth→Mars"]').click();
    await page.locator('.drive-btn[data-drive="ep1"]').click();
    await expect(page.locator('#physics-eqs')).toContainText('BRACHISTOCHRONE');
    await expect(page.locator('#physics-eqs')).toContainText('t = 2·√(d/a)');
    await expect(page.locator('#physics-eqs')).toContainText('g_sun');
    let phys = await page.evaluate(() => ({ p: window._sim.physics, m: window._sim.mission }));
    expect(phys.p.model).toBe('brachistochrone');
    expect(phys.p.tDays).toBeCloseTo(phys.m.transitDays, 1);
    expect(phys.p.vPkKms).toBeCloseTo(phys.m.peakVelKms, 0);

    // Chemical: Hohmann form, Kepler-3 transit time matches, radii come from the data
    await page.locator('.drive-btn[data-drive="chem"]').click();
    await expect(page.locator('#physics-eqs')).toContainText('HOHMANN');
    await expect(page.locator('#physics-eqs')).toContainText('t = π·√(aₜ³/μ)');
    await expect(page.locator('#physics-eqs')).toContainText('Δv');
    phys = await page.evaluate(() => ({ p: window._sim.physics, m: window._sim.mission, bodies: window._sim.data.bodies }));
    expect(phys.p.model).toBe('hohmann');
    expect(phys.p.tDays).toBeCloseTo(phys.m.transitDays, 0);
    expect(phys.p.aT_AU).toBeCloseTo((phys.p.r1AU + phys.p.r2AU) / 2, 6);
  });

  test('20. help tooltips exist and appear on hover', async ({ page }) => {
    await page.goto(URL); await waitLoaded(page);

    // every tooltip term has a real explanation
    const tips = await page.evaluate(() =>
      [...document.querySelectorAll('.tip')].map(el => el.getAttribute('data-tip') || ''));
    expect(tips.length).toBeGreaterThanOrEqual(12); // numbers panel + math panel + labels
    for (const t of tips) expect(t.length).toBeGreaterThan(30);

    // hidden until hover, visible on hover (CSS ::after)
    const term = page.locator('#numbers-panel .np-key.tip').first();
    const before = await term.evaluate(el => getComputedStyle(el, '::after').visibility);
    expect(before).toBe('hidden');
    await term.hover();
    await page.waitForTimeout(300); // transition
    const after = await term.evaluate(el => getComputedStyle(el, '::after').visibility);
    expect(after).toBe('visible');

    // screenshot with a math-panel tooltip showing, for visual review
    await page.locator('#physics-eqs .tip').first().hover();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(__dirname, 'screenshot-tooltip.png') });
  });

});
