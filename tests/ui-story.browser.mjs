#!/usr/bin/env node
// Round 3 Task R3-U1 browser test & evidence capture for the Express v2 panel.
// Serves the repository root over a local static server, verifies every control action,
// keyboard shortcut, W0 fixture rendering, accessibility checks (button names, focus-visible,
// zero horizontal overflow), and optional 2x desktop/phone screenshots (`--screenshots`).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

let chromium, devices;
try {
  ({ chromium, devices } = createRequire(import.meta.url)('playwright'));
} catch {
  console.log('UI-STORY SKIPPED: playwright not available');
  process.exit(2);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const evidenceDir = path.join(root, 'docs', 'evidence', 'r3', 'U1');
const captureScreenshots = process.argv.includes('--screenshots');

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

const problems = [];
const report = [];
const check = (cond, msg) => {
  if (!cond) problems.push(msg);
  else report.push(`PASS: ${msg}`);
};

function startServer() {
  const server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end('Bad request');
      return;
    }
    if (pathname.endsWith('/')) pathname += 'index.html';
    const filePath = path.resolve(root, '.' + pathname);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404).end('Not found');
        return;
      }
      const type = MIME[path.extname(filePath)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      fs.createReadStream(filePath).pipe(res);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function attachMonitors(page, label, localHost) {
  page.on('pageerror', err => {
    problems.push(`[${label}] pageerror: ${err && err.message ? err.message : err}`);
  });
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const loc = msg.location();
    const where = loc && loc.url ? ` (at ${loc.url})` : '';
    problems.push(`[${label}] console.error: ${msg.text()}${where}`);
  });
  page.on('response', res => {
    if (res.status() >= 400) {
      problems.push(`[${label}] HTTP ${res.status()} for ${res.url()}`);
    }
  });
  page.on('request', req => {
    let u;
    try { u = new URL(req.url()); } catch { return; }
    if ((u.protocol === 'http:' || u.protocol === 'https:') && u.host !== localHost) {
      problems.push(`[${label}] external request: ${req.url()}`);
    }
  });
}

async function openStoryPage(context, base, localHost, query, label) {
  const page = await context.newPage();
  attachMonitors(page, label, localHost);
  await page.goto(`${base}/dev/ui-story.html${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__storyReady === true, { timeout: 10000 });
  // Wait for any initial smooth scroll (e.g., codon strip scrolling to #41 UAA) to settle.
  let prevLeft = -1;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(100);
    const curLeft = await page.evaluate(() => {
      const strip = document.querySelector('#view-express .codon-strip');
      return strip ? strip.scrollLeft : 0;
    });
    if (i >= 1 && Math.abs(curLeft - prevLeft) < 0.5) break;
    prevLeft = curLeft;
  }
  return page;
}

async function checkAccessibilityAndOverflow(page, label) {
  const res = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('.ui-root button'));
    const unnamed = [];
    for (const b of buttons) {
      const aria = (b.getAttribute('aria-label') || '').trim();
      const text = (b.innerText || b.textContent || '').trim();
      if (!aria && !text) {
        unnamed.push(b.outerHTML.slice(0, 120));
      }
    }
    const docOverflow = document.documentElement.scrollWidth - window.innerWidth;
    const panelScroll = document.querySelector('.panel-scroll');
    const panelOverflow = panelScroll ? panelScroll.scrollWidth - panelScroll.clientWidth : 0;
    return {
      buttonCount: buttons.length,
      unnamed,
      docOverflow,
      panelOverflow,
    };
  });
  check(res.buttonCount > 0 && res.unnamed.length === 0,
    `${label}: all ${res.buttonCount} buttons have non-empty accessible names (unnamed: ${res.unnamed.length})`);
  check(res.docOverflow <= 0, `${label}: zero horizontal document overflow (${res.docOverflow}px)`);
  check(res.panelOverflow <= 1, `${label}: zero horizontal panel-scroll overflow (${res.panelOverflow}px)`);
}

async function checkFocusVisible(page, label) {
  // Focus interactive controls via keyboard Tab and confirm :focus-visible styling is active.
  await page.focus('#view-express .btn-play');
  const results = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const isFocusVisible = el.matches(':focus-visible');
      const hasOutline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
      const isRange = el.matches('input[type="range"]');
      return {
        tag: el.tagName,
        cls: el.className,
        isFocusVisible,
        hasOutline: hasOutline || isRange, // range uses thumb box-shadow on :focus-visible
        outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`,
      };
    });
    if (info) results.push(info);
  }
  const visibleCount = results.filter(r => r.isFocusVisible && r.hasOutline).length;
  check(visibleCount >= 4, `${label}: keyboard Tab triggers visible focus indicators (${visibleCount}/${results.length} controls)`);
}

async function runTests() {
  const server = await startServer();
  const { port } = server.address();
  const localHost = `127.0.0.1:${port}`;
  const base = `http://${localHost}`;
  let browser;

  try {
    browser = await chromium.launch({
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    });

    const desktopCtx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const phoneProfile = devices['iPhone 13'];
    const phoneCtx = await browser.newContext({
      ...phoneProfile,
      deviceScaleFactor: 2,
    });

    // ---- 1. Full control action matrix + structure + accessibility on desktop ------------------
    const page = await openStoryPage(desktopCtx, base, localHost, '?fixture=ch1&inspect=filled', 'desktop-controls');

    // Verify exact §4.8 item order 1..11 inside #view-express
    const layoutInfo = await page.evaluate(() => {
      const root = document.querySelector('#view-express');
      const kids = Array.from(root.children).map(el => `${el.tagName.toLowerCase()}.${Array.from(el.classList).join('.')}`);
      const h2 = root.querySelector('header.view-head h2')?.textContent;
      const sub = root.querySelector('header.view-head p')?.textContent;
      const chapterCount = root.querySelectorAll('.chapter-row').length;
      const tickCount = root.querySelectorAll('.scrub-ticks i').length;
      const ccellCount = root.querySelectorAll('.ccell').length;
      const pillCount = root.querySelectorAll('.pep-pill').length;
      const statLabels = Array.from(root.querySelectorAll('.stats .stat-l')).map(e => e.textContent);
      const legendLabels = Array.from(root.querySelectorAll('.legend li')).map(e => e.textContent);
      const inspectDts = Array.from(root.querySelectorAll('.inspect-dl dt')).map(e => e.textContent);
      const rcsbHref = root.querySelector('.inspect-dl a.link-btn')?.getAttribute('href');
      const rcsbTarget = root.querySelector('.inspect-dl a.link-btn')?.getAttribute('target');
      const rcsbRel = root.querySelector('.inspect-dl a.link-btn')?.getAttribute('rel');
      const caption = root.querySelector('.caption')?.textContent;
      const explainP = Array.from(root.querySelectorAll('.explain p')).map(e => e.textContent);
      const durText = root.querySelector('.chapter-card .card-sub')?.textContent;
      return {
        kids, h2, sub, chapterCount, tickCount, ccellCount, pillCount,
        statLabels, legendLabels, inspectDts, rcsbHref, rcsbTarget, rcsbRel,
        caption, explainP, durText,
      };
    });

    check(layoutInfo.kids.length === 11, `section#view-express has all 11 §4.8 items (got ${layoutInfo.kids.length})`);
    check(layoutInfo.h2 === 'Express the gene' && layoutInfo.sub === 'From one gene to one protein, at true scale.',
      'header.view-head matches §4.8 item 1 exact copy');
    check(layoutInfo.chapterCount === 16 && layoutInfo.tickCount === 16,
      `chapter list (${layoutInfo.chapterCount}) and scrub ticks (${layoutInfo.tickCount}) have 16 entries`);
    check(layoutInfo.durText === '2:44', `total duration at 1x is 2:44 (got ${layoutInfo.durText})`);
    check(layoutInfo.ccellCount === 41 && layoutInfo.pillCount === 40,
      `codon card has 41 cells (${layoutInfo.ccellCount}) and 40 peptide pills (${layoutInfo.pillCount})`);
    check(JSON.stringify(layoutInfo.statLabels) === JSON.stringify(['mRNA', 'RNA·DNA hybrid', 'Codon', 'Peptide']),
      `4 stats match §4.8 item 8 (${layoutInfo.statLabels.join(', ')})`);
    check(JSON.stringify(layoutInfo.inspectDts) === JSON.stringify(['Source', 'Organism', 'Method', 'Chains shown', 'Detail level', 'Simplifications']),
      'inspect card has all 6 required dl rows');
    check(layoutInfo.rcsbHref === 'https://www.rcsb.org/structure/7K00' && layoutInfo.rcsbTarget === '_blank' && layoutInfo.rcsbRel === 'noopener',
      'RCSB link uses target="_blank" rel="noopener"');
    check(layoutInfo.legendLabels.length === 15 && !layoutInfo.legendLabels.includes('NusG'),
      `sequential legend has 15 entries and omits NusG (got ${layoutInfo.legendLabels.length})`);
    check(layoutInfo.caption && layoutInfo.caption.includes('E. coli') && !layoutInfo.caption.includes('*E. coli*'),
      'chapter 1 caption renders plain text "E. coli" without markdown asterisks');
    check(layoutInfo.explainP.length === 2 && layoutInfo.explainP[0].startsWith('A 248-base-pair synthetic gene in E. coli.'),
      'What you are seeing section matches §4.10 copy');

    // Clear action log before testing every control
    await page.evaluate(() => { window.__actions.length = 0; });

    // 1. play & pause
    await page.click('#view-express .btn-play');
    await page.click('#view-express .btn-play');
    // 2. restart
    await page.click('#view-express button[aria-label="Restart"]');
    // 3. seek
    await page.evaluate(() => {
      const r = document.querySelector('#view-express input[type="range"][aria-label="Story progress"]');
      r.value = '500';
      r.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(60); // allow rAF throttle to fire
    // 4. speed -> 2x
    await page.click('#view-express [role="radiogroup"][aria-label="Speed"] button:has-text("2×")');
    const durAt2x = await page.textContent('#view-express .chapter-card .card-sub');
    check(durAt2x === '1:22', `speed 2× updates total duration to 1:22 (got ${durAt2x})`);
    // 5. mode -> coupled (and verify NusG appears in legend)
    await page.click('#view-express [role="radiogroup"][aria-label="Story"] button:has-text("Coupled")');
    const coupledLegendHasNusg = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#view-express .legend li')).map(e => e.textContent).includes('NusG'));
    check(coupledLegendHasNusg, 'Coupled mode adds NusG to Legend');
    await page.click('#view-express [role="radiogroup"][aria-label="Story"] button:has-text("Step by step")');
    const seqLegendNoNusg = await page.evaluate(() =>
      !Array.from(document.querySelectorAll('#view-express .legend li')).map(e => e.textContent).includes('NusG'));
    check(seqLegendNoNusg, 'Step by step mode hides NusG from Legend');
    // 6. camera -> RNAP
    await page.click('#view-express [role="radiogroup"][aria-label="Camera"] button:has-text("RNAP")');
    // 7. toggles (Cutaway, Labels, Crowding)
    await page.click('#view-express .tiles button:has-text("Cutaway")');
    await page.click('#view-express .tiles button:has-text("Labels")');
    await page.click('#view-express .tiles button:has-text("Crowding")');
    // 8. chapter -> click chapter 6 (index 5)
    await page.click('#view-express .chapter-row >> nth=5');
    const ch6Current = await page.getAttribute('#view-express .chapter-row >> nth=5', 'aria-current');
    check(ch6Current === 'step', 'clicked chapter 6 row has aria-current="step"');
    // 9. selectCodon -> click codon #2 (index 1) then Clear
    await page.click('#view-express .ccell >> nth=1');
    await page.click('#view-express .codon-nav .link-btn');
    // 10. clearInspect -> click Clear selection
    await page.click('#view-express .inspect-card button[aria-label="Clear selection"]');
    const inspectCleared = await page.textContent('#view-express .inspect-card h3');
    check(inspectCleared === 'Inspect', 'Clear selection resets inspect card to empty state');

    const emitted = await page.evaluate(() => window.__actions.slice());
    const hasAction = (act, pred = () => true) => emitted.some(e => e.action === act && pred(e.value));
    check(hasAction('play'), 'btn-play emits play');
    check(hasAction('pause'), 'btn-play emits pause');
    check(hasAction('restart'), 'restart button emits restart');
    check(hasAction('seek', v => Math.abs(v - 0.5) < 0.01), 'scrub slider emits seek(0.5)');
    check(hasAction('speed', v => v === 2), 'speed segmented emits speed(2)');
    check(hasAction('mode', v => v === 'coupled'), 'story segmented emits mode("coupled")');
    check(hasAction('mode', v => v === 'sequential'), 'story segmented emits mode("sequential")');
    check(hasAction('camera', v => v === 'rnap'), 'camera segmented emits camera("rnap")');
    check(hasAction('toggle', v => v && v.cutaway === false), 'Cutaway tile emits toggle({ cutaway: false })');
    check(hasAction('toggle', v => v && v.labels === false), 'Labels tile emits toggle({ labels: false })');
    check(hasAction('toggle', v => v && v.crowding === false), 'Crowding tile emits toggle({ crowding: false })');
    check(hasAction('chapter', v => v === 5), 'chapter row click emits chapter(5)');
    check(hasAction('selectCodon', v => v === 1), 'codon cell click emits selectCodon(1)');
    check(hasAction('selectCodon', v => v === null), 'codon Clear emits selectCodon(null)');
    check(hasAction('clearInspect'), 'inspect close button emits clearInspect');

    // ---- 2. Keyboard shortcuts (active on Express, silent on Explore) --------------------------
    await page.evaluate(() => {
      if (document.activeElement) document.activeElement.blur();
      window.__actions.length = 0;
    });
    // Currently at chapter 5, paused
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Home');
    const kbExpress = await page.evaluate(() => window.__actions.slice());
    check(kbExpress.some(e => e.action === 'play'), 'Space emits play when Express is active');
    check(kbExpress.some(e => e.action === 'pause'), 'Space emits pause when Express is active');
    check(kbExpress.some(e => e.action === 'chapter' && e.value === 6), 'ArrowRight emits next chapter (6)');
    check(kbExpress.some(e => e.action === 'chapter' && e.value === 5), 'ArrowLeft emits previous chapter (5)');
    check(kbExpress.some(e => e.action === 'restart'), 'Home emits restart when Express is active');

    // Switch to Explore tab and verify shortcuts do NOT fire Express actions
    await page.click('#tab-structure');
    await page.evaluate(() => {
      if (document.activeElement) document.activeElement.blur();
      window.__actions.length = 0;
    });
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Home');
    const kbExplore = await page.evaluate(() => window.__actions.slice());
    check(kbExplore.length === 0, `Express keyboard shortcuts do not fire on Explore tab (got ${kbExplore.length} actions)`);

    // Switch back to Express for accessibility & focus-visible checks
    await page.click('#tab-express');
    await checkAccessibilityAndOverflow(page, 'desktop-1440x900');
    await checkFocusVisible(page, 'desktop-1440x900');
    await page.close();

    // ---- 3. W0 fixtures (story-mini.json, world-state.json) + low tier + index.html ------------
    const miniPage = await openStoryPage(desktopCtx, base, localHost, '?fixture=mini', 'fixture-mini');
    const miniInfo = await miniPage.evaluate(() => ({
      count: document.querySelectorAll('#view-express .chapter-row').length,
      chapterCountText: document.querySelector('#view-express .chapter-count')?.textContent,
      caption: document.querySelector('#view-express .caption')?.textContent,
    }));
    check(miniInfo.count === 3 && miniInfo.chapterCountText === '1 / 3',
      `story-mini.json renders 3 chapters (${miniInfo.chapterCountText})`);
    check(miniInfo.caption && miniInfo.caption.includes('E. coli') && !miniInfo.caption.includes('*E. coli*'),
      'story-mini.json caption has plain "E. coli"');
    await miniPage.close();

    const wsPage = await openStoryPage(desktopCtx, base, localHost, '?fixture=world&tier=low', 'fixture-world-low');
    const wsInfo = await wsPage.evaluate(() => ({
      stats: Array.from(document.querySelectorAll('#view-express .stats .stat-v')).map(e => e.textContent),
      crowdingPressed: Array.from(document.querySelectorAll('#view-express .tiles button'))
        .find(b => b.textContent.includes('Crowding'))?.getAttribute('aria-pressed'),
    }));
    check(JSON.stringify(wsInfo.stats) === JSON.stringify(['81', '9', '—', '0']),
      `world-state.json renders counters [81, 9, —, 0] (got ${JSON.stringify(wsInfo.stats)})`);
    check(wsInfo.crowdingPressed === 'false', `low tier sets Crowding off by default (got ${wsInfo.crowdingPressed})`);
    await wsPage.close();

    // Verify index.html?mode=express&scene=v2 renders cleanly without errors, and ?mode=express stays v1
    const v2App = await desktopCtx.newPage();
    attachMonitors(v2App, 'index-v2', localHost);
    await v2App.goto(`${base}/index.html?mode=express&scene=v2`, { waitUntil: 'load' });
    await v2App.waitForTimeout(800);
    const hasV2Slider = await v2App.evaluate(() =>
      !!document.querySelector('#view-express input[type="range"][aria-label="Story progress"]'));
    check(hasV2Slider, 'index.html?mode=express&scene=v2 mounts Express v2 panel cleanly');
    await v2App.close();

    const v1App = await desktopCtx.newPage();
    attachMonitors(v1App, 'index-v1', localHost);
    await v1App.goto(`${base}/index.html?mode=express`, { waitUntil: 'load' });
    await v1App.waitForTimeout(800);
    const hasV1Slider = await v1App.evaluate(() =>
      !!document.querySelector('#view-express input[type="range"][aria-label="Gene expression progress"]'));
    check(hasV1Slider, 'index.html?mode=express (without scene=v2) keeps Round 1 Express panel untouched');
    await v1App.close();

    // ---- 4. Phone layout accessibility & overflow check (iPhone 13) ----------------------------
    const phoneCheck = await openStoryPage(phoneCtx, base, localHost, '?fixture=ch6&inspect=filled&sheet=full', 'phone-check');
    await checkAccessibilityAndOverflow(phoneCheck, 'phone-iPhone13');
    await phoneCheck.close();

    // ---- 5. Visual evidence screenshots (2x desktop 1440x900 & iPhone 13) ----------------------
    if (captureScreenshots) {
      fs.mkdirSync(evidenceDir, { recursive: true });
      const shots = [
        { name: 'ch1', query: '?fixture=ch1&inspect=empty', scroll: null },
        { name: 'ch6', query: '?fixture=ch6&inspect=empty', scroll: null },
        { name: 'ch14', query: '?fixture=ch14&inspect=empty', scroll: 'codons' },
        { name: 'ch16', query: '?fixture=ch16&inspect=empty', scroll: 'codons' },
        { name: 'inspect-empty', query: '?fixture=ch6&inspect=empty', scroll: 'inspect' },
        { name: 'inspect-filled', query: '?fixture=ch6&inspect=filled', scroll: 'inspect' },
      ];
      for (const s of shots) {
        const scrollQ = s.scroll ? `&scroll=${s.scroll}` : '';
        const dp = await openStoryPage(desktopCtx, base, localHost, `${s.query}${scrollQ}`, `shot-desktop-${s.name}`);
        await dp.screenshot({
          path: path.join(evidenceDir, `desktop-${s.name}.jpg`),
          type: 'jpeg',
          quality: 90,
        });
        await dp.close();

        const sheetMode = s.name === 'ch1' ? 'peek' : 'full';
        const pp = await openStoryPage(phoneCtx, base, localHost, `${s.query}&sheet=${sheetMode}${scrollQ}`, `shot-phone-${s.name}`);
        await pp.screenshot({
          path: path.join(evidenceDir, `phone-${s.name}.jpg`),
          type: 'jpeg',
          quality: 90,
        });
        await pp.close();
      }
      // Also capture phone ch1 expanded (sheet=full) so both collapsed peek and expanded views are evidenced
      const ppFull = await openStoryPage(phoneCtx, base, localHost, '?fixture=ch1&inspect=empty&sheet=full', 'shot-phone-ch1-full');
      await ppFull.screenshot({
        path: path.join(evidenceDir, 'phone-ch1-expanded.jpg'),
        type: 'jpeg',
        quality: 90,
      });
      await ppFull.close();
    }

    await desktopCtx.close();
    await phoneCtx.close();
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

try {
  await runTests();
} catch (err) {
  problems.push(`harness error: ${err && err.stack ? err.stack : err}`);
}

for (const line of report) console.log(line);
if (problems.length === 0) {
  console.log(`UI-STORY PASS (${report.length} checks)`);
  process.exit(0);
}
for (const line of problems) console.error('FAIL:', line);
console.log(`UI-STORY FAIL (${problems.length} failures, ${report.length} passed)`);
process.exit(1);
