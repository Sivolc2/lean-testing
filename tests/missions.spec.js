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
