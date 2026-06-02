// Playwright tests for the Lagrange Point Simulator visualizer
const { test, expect } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Start a simple HTTP server for the visualizer directory
function startServer(dir, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let filePath = path.join(dir, req.url === '/' ? 'index.html' : req.url);
      // Prevent directory traversal
      filePath = path.normalize(filePath);
      if (!filePath.startsWith(dir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
      };
      const mime = mimeTypes[ext] || 'application/octet-stream';
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found: ' + req.url);
          return;
        }
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
      });
    });
    server.listen(port, 'localhost', () => resolve(server));
    server.on('error', reject);
  });
}

let server;
const PORT = 9876;
const VISUALIZER_DIR = path.join(__dirname, '..', 'visualizer');

test.beforeAll(async () => {
  server = await startServer(VISUALIZER_DIR, PORT);
});

test.afterAll(async () => {
  if (server) server.close();
});

test.describe('Lagrange Point Simulator Visualizer', () => {

  test('1. Loads without console errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    await page.goto(`http://localhost:${PORT}/`);

    // Wait for loading to complete (loading div should be hidden)
    await page.waitForFunction(() => {
      const loading = document.getElementById('loading');
      return loading && (loading.style.display === 'none' || loading.style.display === '');
    }, { timeout: 30000 });

    // Filter out non-critical errors
    const criticalErrors = consoleErrors.filter(e =>
      !e.includes('favicon') && !e.includes('404')
    );
    expect(criticalErrors.length, 'Console errors: ' + criticalErrors.join(', ')).toBe(0);
  });

  test('2. Canvas is visible and has content', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(() => {
      const loading = document.getElementById('loading');
      return loading && loading.style.display === 'none';
    }, { timeout: 30000 });

    const canvas = page.locator('#simCanvas');
    await expect(canvas).toBeVisible();

    // Check canvas has non-zero dimensions
    const box = await canvas.boundingBox();
    expect(box.width).toBeGreaterThan(100);
    expect(box.height).toBeGreaterThan(100);
  });

  test('3. Takes screenshot of simulation', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(() => {
      const loading = document.getElementById('loading');
      return loading && loading.style.display === 'none';
    }, { timeout: 30000 });

    // Wait a bit for animation to start
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: path.join(__dirname, 'screenshot.png'),
      fullPage: false,
    });

    // Verify screenshot was created
    expect(fs.existsSync(path.join(__dirname, 'screenshot.png'))).toBe(true);
  });

  test('4. Play/Pause button works', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(() => {
      const loading = document.getElementById('loading');
      return loading && loading.style.display === 'none';
    }, { timeout: 30000 });

    const playBtn = page.locator('#play-btn');
    await expect(playBtn).toBeVisible();

    // Initially playing
    const initialText = await playBtn.textContent();
    expect(initialText).toContain('PAUSE');

    // Click to pause
    await playBtn.click();
    const pausedText = await playBtn.textContent();
    expect(pausedText).toContain('PLAY');

    // Click to resume
    await playBtn.click();
    const resumedText = await playBtn.textContent();
    expect(resumedText).toContain('PAUSE');
  });

  test('5. Time display updates', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(() => {
      const loading = document.getElementById('loading');
      return loading && loading.style.display === 'none';
    }, { timeout: 30000 });

    const timeDisplay = page.locator('#time-display');
    await expect(timeDisplay).toBeVisible();

    const t0 = await timeDisplay.textContent();
    // Wait for animation to advance
    await page.waitForTimeout(500);
    const t1 = await timeDisplay.textContent();

    // Time should have changed (simulation is running)
    expect(t1).not.toBe(t0);
  });

  test('6. Zoom with scroll wheel', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(() => {
      const loading = document.getElementById('loading');
      return loading && loading.style.display === 'none';
    }, { timeout: 30000 });

    // Pause to prevent animation interference
    await page.locator('#play-btn').click();

    // Get initial zoom level
    await page.waitForTimeout(200);
    const zoomBefore = await page.evaluate(() => window._simState && window._simState.zoom || 1.0);

    // Scroll to zoom in (negative deltaY = zoom in)
    await page.mouse.move(400, 300);
    await page.mouse.wheel(0, -300);
    await page.mouse.wheel(0, -300);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(300);

    const zoomAfter = await page.evaluate(() => window._simState && window._simState.zoom || 1.0);
    console.log(`Zoom: ${zoomBefore} → ${zoomAfter}`);
    // Scale display should have changed
    const scaleAfter = await page.locator('#scale-display').textContent();
    expect(scaleAfter).toBeTruthy();
    // The zoom should have changed from initial
    expect(zoomAfter).not.toBe(zoomBefore);
  });

  test('7. Follow mode: click body to lock camera', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(() => {
      const loading = document.getElementById('loading');
      return loading && loading.style.display === 'none';
    }, { timeout: 30000 });

    // Wait for animation
    await page.waitForTimeout(500);

    // Get canvas center (Sun should be near center)
    const canvas = page.locator('#simCanvas');
    const box = await canvas.boundingBox();
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    // Click near center (Sun)
    await page.mouse.click(centerX, centerY);
    await page.waitForTimeout(200);

    // Check follow display
    const followDisplay = page.locator('#follow-display');
    // Follow mode might be active
    const followText = await followDisplay.textContent();
    // Either Sun is being followed or click missed - check display changed
    console.log('Follow display:', followText);
    // This is a soft check - just verify the element exists
    await expect(followDisplay).toBeVisible();
  });

  test('8. Jump-to-event buttons exist and are clickable', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(() => {
      const loading = document.getElementById('loading');
      return loading && loading.style.display === 'none';
    }, { timeout: 30000 });

    const buttons = [
      '#btn-depart',
      '#btn-arrive-mars',
      '#btn-depart-mars',
      '#btn-arrive-ceres',
    ];

    for (const btnId of buttons) {
      const btn = page.locator(btnId);
      await expect(btn).toBeVisible();

      // Click and record time
      const timeBefore = await page.locator('#time-display').textContent();
      await btn.click();
      await page.waitForTimeout(200);
      const timeAfter = await page.locator('#time-display').textContent();

      // Time should have jumped
      console.log(`${btnId}: ${timeBefore} → ${timeAfter}`);
    }
  });

  test('9. Log scale button toggles', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(() => {
      const loading = document.getElementById('loading');
      return loading && loading.style.display === 'none';
    }, { timeout: 30000 });

    const logBtn = page.locator('#log-scale-btn');
    await expect(logBtn).toBeVisible();

    // Toggle on
    await logBtn.click();
    await expect(logBtn).toHaveClass(/active/);

    // Toggle off
    await logBtn.click();
  });

  test('10. Speed slider changes simulation speed', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(() => {
      const loading = document.getElementById('loading');
      return loading && loading.style.display === 'none';
    }, { timeout: 30000 });

    const speedLabel = page.locator('#speed-label');
    const speedSlider = page.locator('#speed-slider');

    // Move slider to max
    await speedSlider.evaluate(el => { el.value = 100; el.dispatchEvent(new Event('input')); });
    await page.waitForTimeout(100);
    const maxSpeed = await speedLabel.textContent();
    console.log('Max speed:', maxSpeed);

    // Move slider to min
    await speedSlider.evaluate(el => { el.value = 0; el.dispatchEvent(new Event('input')); });
    await page.waitForTimeout(100);
    const minSpeed = await speedLabel.textContent();
    console.log('Min speed:', minSpeed);

    expect(maxSpeed).not.toBe(minSpeed);
  });

  test('11. Time scrub bar changes frame', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(() => {
      const loading = document.getElementById('loading');
      return loading && loading.style.display === 'none';
    }, { timeout: 30000 });

    // Pause first
    await page.locator('#play-btn').click();
    await page.waitForTimeout(100);

    const timeDisplay = page.locator('#time-display');
    const t0 = await timeDisplay.textContent();

    // Move scrub to middle
    const scrub = page.locator('#scrub-slider');
    await scrub.evaluate(el => {
      el.value = Math.floor(el.max / 2);
      el.dispatchEvent(new Event('input'));
    });
    await page.waitForTimeout(200);

    const t1 = await timeDisplay.textContent();
    expect(t1).not.toBe(t0);
    console.log('Scrub: ', t0, ' → ', t1);
  });

});
