#!/usr/bin/env node
// Round 3 Task R3-U2 browser test & evidence capture for Inspection (`js/ui/inspect.js`)
// and Sources (`js/ui/about.js`).
// Verifies in Playwright:
// 1. Every committed real asset in `assets/manifest.json` (`rnap-ec`, `rnap-holo` core & `sigma`,
//    `ribosome-70s` `small` & `large`, `trna-init`, `trna-aa`, `rf1`, `ef-tu`, `ef-g`, `if1`, `if2`,
//    `if3`, `nusg`) plus all 6 procedural molecule kinds (`DNA`, `mRNA`, `tRNA anticodon`, `peptide`,
//    `NTP`, `PPi`) builds a valid `InspectInfo` via `buildInspectInfo` and renders all 6
//    `<dl class="inspect-dl">` rows (`Source`, `Organism`, `Method`, `Chains shown`, `Detail level`,
//    `Simplifications`) in `view-story.js` (`dev/ui-story.html`).
// 2. Every procedural role sentence is <= 120 characters and every machine role sentence matches
//    `PLAN.md` §5.4 verbatim.
// 3. For every PDB-backed asset, the `RCSB ↗` link (`a.link-btn`) has `target="_blank"`,
//    `rel="noopener"`, and `href="https://www.rcsb.org/structure/<PDB>"`, is the ONLY external URL,
//    and causes zero external network requests on page load or card render.
// 4. Opening the About dialog (`?` key or button on `index.html?mode=express&scene=v2`) displays
//    the `"Sources"` section containing every `PLAN.md` §7.2 PDB entry (`6ALF`, `6C9Y`, `6CA0`,
//    `7K00`, `7ST2`, `8FZH`, `5WE4`, `7PJV`, `9ZN2`, `9FDA`, `6ZTJ`, `7YPA`, `1BNA`) formatted per
//    `PLAN.md` §4.10 with zero console or network errors.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

let chromium, devices;
try {
  ({ chromium, devices } = createRequire(import.meta.url)('playwright'));
} catch {
  console.log('UI-INSPECT SKIPPED: playwright not available');
  process.exit(2);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const evidenceDir = path.join(root, 'docs', 'evidence', 'r3', 'U2');
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

function attachMonitors(page, label, localHost, extCounter) {
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
      extCounter.count++;
      problems.push(`[${label}] external request: ${req.url()}`);
    }
  });
}

const EXPECTED_MACHINES = [
  {
    label: 'rnap-ec (core)',
    pick: { actor: 'rnap-ec', part: 'core', chain: 'J' },
    expectedName: 'RNA polymerase',
    expectedRole: 'Copies the template DNA strand into RNA, 5′→3′.',
    expectedSimp: 'Rigid structure; DNA bend from one structure (6ALF)',
    expectedPdb: '6ALF',
  },
  {
    label: 'rnap-holo (core)',
    pick: { actor: 'rnap-holo', part: 'core', chain: 'D' },
    expectedName: 'RNA polymerase',
    expectedRole: 'Copies the template DNA strand into RNA, 5′→3′.',
    expectedSimp: 'Rigid structure; DNA bend from one structure (6ALF)',
    expectedPdb: '6C9Y',
  },
  {
    label: 'rnap-holo (sigma)',
    pick: { actor: 'rnap-holo', part: 'sigma', chain: 'F' },
    expectedName: 'σ⁷⁰',
    expectedRole: 'Recognises the −35 and −10 promoter elements and helps open the DNA.',
    expectedSimp: 'Released at nucleotide 12 here; often retained longer',
    expectedPdb: '6C9Y',
  },
  {
    label: 'ribosome-70s (small / 30S)',
    pick: { actor: 'ribosome-70s', part: 'small', chain: 'A' },
    expectedName: '30S subunit',
    expectedRole: 'Binds the mRNA and checks codon–anticodon pairing in the decoding centre.',
    expectedSimp: 'Rigid; head swivel not shown',
    expectedPdb: '7K00',
  },
  {
    label: 'ribosome-70s (large / 50S)',
    pick: { actor: 'ribosome-70s', part: 'large', chain: 'a' },
    expectedName: '50S subunit',
    expectedRole: 'Joins amino acids in the peptidyl-transferase centre; the peptide leaves through its exit tunnel.',
    expectedSimp: 'Rigid; L1 stalk movement not shown',
    expectedPdb: '7K00',
  },
  {
    label: 'trna-init',
    pick: { actor: 'trna-init', part: 'body', chain: 'Z' },
    expectedName: 'Initiator tRNA',
    expectedRole: 'Carries formyl-methionine to the start codon in the P site.',
    expectedSimp: 'Pre-charged; formylation not shown',
    expectedPdb: '7K00',
  },
  {
    label: 'trna-aa',
    pick: { actor: 'trna-aa', part: 'body', chain: 'Y' },
    expectedName: 'Elongator tRNA',
    expectedRole: 'Carries one amino acid and pairs its anticodon with the codon.',
    expectedSimp: 'One body for all amino acids; anticodon rebuilt per codon',
    expectedPdb: '7K00',
  },
  {
    label: 'ef-tu',
    pick: { actor: 'ef-tu', part: 'body', chain: 'z' },
    expectedName: 'EF-Tu',
    expectedRole: 'Delivers aminoacyl-tRNAs to the A site and hydrolyses GTP on correct pairing.',
    expectedSimp: 'Proofreading not shown',
    expectedPdb: '5WE4',
  },
  {
    label: 'ef-g',
    pick: { actor: 'ef-g', part: 'body', chain: 'x' },
    expectedName: 'EF-G',
    expectedRole: 'Uses GTP to move tRNAs and mRNA by one codon.',
    expectedSimp: 'Hybrid states only where the structure provides them',
    expectedPdb: '7PJV',
  },
  {
    label: 'rf1',
    pick: { actor: 'rf1', part: 'body', chain: 'w' },
    expectedName: 'RF1',
    expectedRole: 'Reads UAA and UAG and releases the finished peptide.',
    expectedSimp: 'RF3 and recycling not shown',
    expectedPdb: '8FZH',
  },
  {
    label: 'if1',
    pick: { actor: 'if1', part: 'body', chain: 'y' },
    expectedName: 'IF1',
    expectedRole: 'Guide the initiator tRNA to the start codon and control subunit joining.',
    expectedSimp: 'Canonical order only',
    expectedPdb: '9ZN2',
  },
  {
    label: 'if2',
    pick: { actor: 'if2', part: 'body', chain: 'x' },
    expectedName: 'IF2',
    expectedRole: 'Guide the initiator tRNA to the start codon and control subunit joining.',
    expectedSimp: 'Canonical order only',
    expectedPdb: '9ZN2',
  },
  {
    label: 'if3',
    pick: { actor: 'if3', part: 'body', chain: 'J' },
    expectedName: 'IF3',
    expectedRole: 'Guide the initiator tRNA to the start codon and control subunit joining.',
    expectedSimp: 'Canonical order only',
    expectedPdb: '9FDA',
  },
  {
    label: 'nusg',
    pick: { actor: 'nusg', part: 'body', chain: 'CF' },
    expectedName: 'NusG',
    expectedRole: 'Bridges RNA polymerase and the ribosome in coupled expression.',
    expectedSimp: 'Fixed coupling geometry',
    expectedPdb: '6ZTJ',
  },
];

const EXPECTED_PROCEDURAL = [
  {
    label: 'DNA',
    pick: { nucleotide: 10, role: 'coding', strand: 0 },
  },
  {
    label: 'mRNA',
    pick: { nucleotide: 50, role: 'mrna', strand: 2 },
  },
  {
    label: 'tRNA anticodon',
    pick: { nucleotide: 0, role: 'anticodon', kind: 'anticodon' },
  },
  {
    label: 'peptide',
    pick: { residue: 4, kind: 'peptide', atomGroup: 'peptide' },
  },
  {
    label: 'NTP',
    pick: { kind: 'ntp', atomGroup: 'ntp', base: 'A' },
  },
  {
    label: 'PPi',
    pick: { kind: 'ppi', atomGroup: 'ppi' },
  },
];

const EXPECTED_SOURCE_PDBS = [
  '6ALF', '6C9Y', '6CA0', '7K00', '7ST2', '8FZH',
  '5WE4', '7PJV', '9ZN2', '9FDA', '6ZTJ', '7YPA', '1BNA',
];

async function runTests() {
  const server = await startServer();
  const { port } = server.address();
  const localHost = `127.0.0.1:${port}`;
  const base = `http://${localHost}`;
  const extCounter = { count: 0 };
  let browser;

  try {
    browser = await chromium.launch({
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    });

    const desktopCtx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const phoneCtx = await browser.newContext({
      ...devices['iPhone 13'],
      deviceScaleFactor: 2,
    });

    // ---- 1. Test buildInspectInfo + view-story.js inspect card rendering on dev/ui-story.html ----
    const page = await desktopCtx.newPage();
    attachMonitors(page, 'ui-inspect-story', localHost, extCounter);
    await page.goto(`${base}/dev/ui-story.html?fixture=ch6&inspect=empty&scroll=inspect`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__storyReady === true, { timeout: 10000 });

    // Load all manifest assets and buildInspectInfo inside the browser context
    const matrixResult = await page.evaluate(async ({ machines, procedurals }) => {
      const { loadManifest, loadAssets } = await import('../js/assets/registry.js');
      const { buildInspectInfo } = await import('../js/ui/inspect.js');

      const manifest = await loadManifest();
      const realIds = manifest.assets.filter(a => !a.synthetic).map(a => a.id);
      const assets = await loadAssets(realIds);

      const readRenderedCard = () => {
        const card = document.querySelector('#view-express .inspect-card');
        const h3 = card.querySelector('.card-title h3')?.textContent;
        const role = card.querySelector('.inspect-role')?.textContent;
        const dts = Array.from(card.querySelectorAll('.inspect-dl dt')).map(el => el.textContent);
        const dds = Array.from(card.querySelectorAll('.inspect-dl dd')).map(el => el.textContent.trim());
        const simps = Array.from(card.querySelectorAll('.inspect-dl ul li')).map(el => el.textContent);
        const links = Array.from(card.querySelectorAll('a[href]')).map(a => ({
          text: a.textContent,
          href: a.getAttribute('href'),
          target: a.getAttribute('target'),
          rel: a.getAttribute('rel'),
        }));
        return { h3, role, dts, dds, simps, links };
      };

      const nullResult = buildInspectInfo(null, assets, null);
      const emptyObjResult = buildInspectInfo({}, assets, null);

      const machineResults = [];
      for (const m of machines) {
        const info = buildInspectInfo(m.pick, assets, null, { level: 'l1' });
        window.ui.setExpressState({ inspect: info });
        const dom = readRenderedCard();
        machineResults.push({ label: m.label, info, dom });
      }

      // Check detail level mapping for l0, l1, l2
      const lodChecks = {
        l0: buildInspectInfo({ actor: 'ribosome-70s', part: 'small' }, assets, null, { level: 'l0' })?.detail,
        l1: buildInspectInfo({ actor: 'ribosome-70s', part: 'small' }, assets, null, { level: 'l1' })?.detail,
        l2: buildInspectInfo({ actor: 'ribosome-70s', part: 'small' }, assets, null, { level: 'l2' })?.detail,
        actorLevelsMap: buildInspectInfo(
          { actor: 'rnap' },
          assets,
          { machines: [{ id: 'rnap', assetId: 'rnap-ec' }] },
          { actorLevels: [{ id: 'rnap', level: 'l2' }] }
        )?.detail,
      };

      const proceduralResults = [];
      for (const p of procedurals) {
        const info = buildInspectInfo(p.pick, assets, null);
        window.ui.setExpressState({ inspect: info });
        const dom = readRenderedCard();
        proceduralResults.push({ label: p.label, info, dom });
      }

      return {
        realIds,
        nullResult,
        emptyObjResult,
        machineResults,
        lodChecks,
        proceduralResults,
      };
    }, { machines: EXPECTED_MACHINES, procedurals: EXPECTED_PROCEDURAL });

    check(matrixResult.nullResult === null && matrixResult.emptyObjResult === null,
      'buildInspectInfo returns null for null or empty pick');
    check(matrixResult.realIds.length === 12,
      `all 12 real assets loaded from assets/manifest.json (${matrixResult.realIds.join(', ')})`);
    check(
      matrixResult.lodChecks.l0 === 'Surface' &&
      matrixResult.lodChecks.l1 === 'Residues' &&
      matrixResult.lodChecks.l2 === 'Atoms' &&
      matrixResult.lodChecks.actorLevelsMap === 'Atoms',
      `detail level maps l0->Surface, l1->Residues, l2->Atoms (${JSON.stringify(matrixResult.lodChecks)})`
    );

    const EXPECTED_DTS = ['Source', 'Organism', 'Method', 'Chains shown', 'Detail level', 'Simplifications'];

    for (let i = 0; i < EXPECTED_MACHINES.length; i++) {
      const exp = EXPECTED_MACHINES[i];
      const { info, dom } = matrixResult.machineResults[i];
      check(!!info && dom.h3 === exp.expectedName,
        `[${exp.label}] card title renders "${exp.expectedName}" (got "${dom.h3}")`);
      check(dom.role === exp.expectedRole,
        `[${exp.label}] role matches PLAN.md §5.4 verbatim`);
      check(JSON.stringify(dom.dts) === JSON.stringify(EXPECTED_DTS),
        `[${exp.label}] renders all 6 <dl class="inspect-dl"> rows`);
      check(dom.dds.every(v => v.length > 0 && v !== '—'),
        `[${exp.label}] all 6 <dd> rows are non-empty`);
      check(dom.simps.includes(exp.expectedSimp),
        `[${exp.label}] simplifications includes exact §5.4 bullet "${exp.expectedSimp}"`);
      const expectedHref = `https://www.rcsb.org/structure/${exp.expectedPdb}`;
      check(
        dom.links.length === 1 &&
        dom.links[0].text === 'RCSB ↗' &&
        dom.links[0].href === expectedHref &&
        dom.links[0].target === '_blank' &&
        dom.links[0].rel === 'noopener',
        `[${exp.label}] RCSB ↗ link is the ONLY external URL (${expectedHref}, target="_blank" rel="noopener")`
      );
    }

    for (let i = 0; i < EXPECTED_PROCEDURAL.length; i++) {
      const exp = EXPECTED_PROCEDURAL[i];
      const { info, dom } = matrixResult.proceduralResults[i];
      check(!!info && dom.h3 && dom.h3 !== 'Inspect',
        `[procedural ${exp.label}] card title renders "${dom.h3}"`);
      check(typeof dom.role === 'string' && dom.role.length > 0 && dom.role.length <= 120,
        `[procedural ${exp.label}] role sentence <= 120 chars (${dom.role ? dom.role.length : 0} chars: "${dom.role}")`);
      check(JSON.stringify(dom.dts) === JSON.stringify(EXPECTED_DTS),
        `[procedural ${exp.label}] renders all 6 <dl class="inspect-dl"> rows`);
      check(dom.dds[4] === 'Procedural',
        `[procedural ${exp.label}] Detail level is "Procedural" (got "${dom.dds[4]}")`);
      check(dom.simps.includes('Procedural; ideal geometry') && dom.simps.length >= 2,
        `[procedural ${exp.label}] simplifications includes "Procedural; ideal geometry" + §5.2 item`);
      check(dom.links.length === 0,
        `[procedural ${exp.label}] has zero external links`);
    }

    // ---- 2. Capture inspect screenshots on desktop & phone if requested ----
    if (captureScreenshots) {
      fs.mkdirSync(evidenceDir, { recursive: true });

      // Set 30S subunit from buildInspectInfo and capture desktop
      await page.evaluate(async () => {
        const { loadAsset } = await import('../js/assets/registry.js');
        const { buildInspectInfo } = await import('../js/ui/inspect.js');
        const ribo = await loadAsset('ribosome-70s');
        const info = buildInspectInfo(
          { actor: 'ribosome-70s', part: 'small', chain: 'A' },
          { 'ribosome-70s': ribo },
          null,
          { level: 'l1' }
        );
        window.ui.setExpressState({ inspect: info });
        document.querySelector('#view-express .inspect-card')?.scrollIntoView({ block: 'start', behavior: 'instant' });
      });
      await page.waitForTimeout(100);
      await page.screenshot({
        path: path.join(evidenceDir, 'desktop-inspect-ribosome-30s.jpg'),
        type: 'jpeg',
        quality: 90,
      });

      // Set procedural mRNA from buildInspectInfo and capture desktop
      await page.evaluate(async () => {
        const { buildInspectInfo } = await import('../js/ui/inspect.js');
        const info = buildInspectInfo({ nucleotide: 50, role: 'mrna', strand: 2 }, {}, null);
        window.ui.setExpressState({ inspect: info });
        document.querySelector('#view-express .inspect-card')?.scrollIntoView({ block: 'start', behavior: 'instant' });
      });
      await page.waitForTimeout(100);
      await page.screenshot({
        path: path.join(evidenceDir, 'desktop-inspect-procedural-mrna.jpg'),
        type: 'jpeg',
        quality: 90,
      });

      // Phone inspect card (RNAP holoenzyme sigma70)
      const phonePage = await phoneCtx.newPage();
      attachMonitors(phonePage, 'phone-inspect', localHost, extCounter);
      await phonePage.goto(`${base}/dev/ui-story.html?fixture=ch6&inspect=empty&sheet=full&scroll=inspect`, { waitUntil: 'load' });
      await phonePage.waitForFunction(() => window.__storyReady === true, { timeout: 10000 });
      await phonePage.evaluate(async () => {
        const { loadAsset } = await import('../js/assets/registry.js');
        const { buildInspectInfo } = await import('../js/ui/inspect.js');
        const holo = await loadAsset('rnap-holo');
        const info = buildInspectInfo(
          { actor: 'rnap-holo', part: 'sigma', chain: 'F' },
          { 'rnap-holo': holo },
          null,
          { level: 'l1' }
        );
        window.ui.setExpressState({ inspect: info });
        document.querySelector('#view-express .inspect-card')?.scrollIntoView({ block: 'start', behavior: 'instant' });
      });
      await phonePage.waitForTimeout(100);
      await phonePage.screenshot({
        path: path.join(evidenceDir, 'phone-inspect-sigma70.jpg'),
        type: 'jpeg',
        quality: 90,
      });
      await phonePage.close();
    }

    await page.close();

    // ---- 3. Verify About dialog "Sources" section (? key, Escape close, button click) ----
    const appPage = await desktopCtx.newPage();
    attachMonitors(appPage, 'about-sources', localHost, extCounter);
    await appPage.goto(`${base}/index.html?mode=express&scene=v2`, { waitUntil: 'load' });
    await appPage.waitForFunction(() => {
      const l = document.querySelector('.loading');
      return l && l.classList.contains('is-off');
    }, { timeout: 10000 });

    // Open About dialog with '?' key
    await appPage.keyboard.press('?');
    await appPage.waitForFunction(() => {
      const scrim = document.querySelector('.scrim');
      return scrim && !scrim.hidden && scrim.classList.contains('is-open');
    }, { timeout: 5000 });

    const aboutInfo = await appPage.evaluate(() => {
      const dlg = document.querySelector('.modal[role="dialog"]');
      const headings = Array.from(dlg.querySelectorAll('h3')).map(h => h.textContent.trim());
      const sourceItems = Array.from(dlg.querySelectorAll('ul.sources li')).map(li => ({
        pdb: li.getAttribute('data-pdb'),
        text: li.textContent.trim(),
      }));
      const externalLinks = Array.from(dlg.querySelectorAll('a[href]')).map(a => a.getAttribute('href'));
      return { headings, sourceItems, externalLinks };
    });

    check(aboutInfo.headings.includes('Sources'),
      `About dialog includes "Sources" heading (headings: ${aboutInfo.headings.join(', ')})`);
    check(aboutInfo.sourceItems.length === EXPECTED_SOURCE_PDBS.length,
      `About Sources lists all ${EXPECTED_SOURCE_PDBS.length} PDB entries`);

    // Pattern per PLAN.md §4.10: `PDB <id> — <title>, <first author> et al. (<year>), <journal>. <resolution> Å, <method>.`
    const formatRegex = /^PDB [0-9A-Z]{4} — .+, .+ et al\. \(\d{4}\), .+\. \d+(?:\.\d+)? Å, .+\.$/;
    for (const pdbId of EXPECTED_SOURCE_PDBS) {
      const entry = aboutInfo.sourceItems.find(x => x.pdb === pdbId);
      check(!!entry && formatRegex.test(entry.text),
        `About Sources entry for PDB ${pdbId} matches §4.10 format ("${entry ? entry.text : 'MISSING'}")`);
    }

    if (captureScreenshots) {
      await appPage.evaluate(() => {
        const srcHeading = Array.from(document.querySelectorAll('.modal h3')).find(h => h.textContent === 'Sources');
        if (srcHeading) srcHeading.scrollIntoView({ block: 'start', behavior: 'instant' });
      });
      await appPage.waitForTimeout(100);
      await appPage.screenshot({
        path: path.join(evidenceDir, 'desktop-about-sources.jpg'),
        type: 'jpeg',
        quality: 90,
      });

      const phoneAbout = await phoneCtx.newPage();
      attachMonitors(phoneAbout, 'phone-about-sources', localHost, extCounter);
      await phoneAbout.goto(`${base}/dev/ui-story.html?fixture=ch1&inspect=empty`, { waitUntil: 'load' });
      await phoneAbout.waitForFunction(() => window.__storyReady === true, { timeout: 10000 });
      await phoneAbout.click('button[aria-label="About, references and shortcuts"]');
      await phoneAbout.waitForFunction(() => {
        const scrim = document.querySelector('.scrim');
        return scrim && !scrim.hidden && scrim.classList.contains('is-open');
      }, { timeout: 5000 });
      await phoneAbout.evaluate(() => {
        const srcHeading = Array.from(document.querySelectorAll('.modal h3')).find(h => h.textContent === 'Sources');
        if (srcHeading) srcHeading.scrollIntoView({ block: 'start', behavior: 'instant' });
      });
      await phoneAbout.waitForTimeout(100);
      await phoneAbout.screenshot({
        path: path.join(evidenceDir, 'phone-about-sources.jpg'),
        type: 'jpeg',
        quality: 90,
      });
      await phoneAbout.close();
    }

    // Focus inside the modal dialog and close with Escape, then verify opening via button click
    await appPage.focus('.modal[role="dialog"]');
    await appPage.keyboard.press('Escape');
    await appPage.waitForFunction(() => {
      const scrim = document.querySelector('.scrim');
      return scrim && scrim.hidden === true;
    }, { timeout: 5000 });
    check(true, 'Escape closes the About dialog cleanly');

    await appPage.evaluate(() => {
      document.querySelector('button[aria-label="About, references and shortcuts"]')?.click();
    });
    await appPage.waitForFunction(() => {
      const scrim = document.querySelector('.scrim');
      return scrim && !scrim.hidden && scrim.classList.contains('is-open');
    }, { timeout: 5000 });
    check(true, 'About button click opens the About dialog cleanly');
    await appPage.close();

    check(extCounter.count === 0, `zero external network requests made during entire test run (count: ${extCounter.count})`);

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
  console.log(`UI-INSPECT PASS (${report.length} checks)`);
  process.exit(0);
}
for (const line of problems) console.error('FAIL:', line);
console.log(`UI-INSPECT FAIL (${problems.length} failures, ${report.length} passed)`);
process.exit(1);
