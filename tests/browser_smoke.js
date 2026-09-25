'use strict';
// browser_smoke.js — receiver smoke for Withdrawn Sources.
// Run via tests/run_browser_smoke.py (stages the site and serves it locally),
// or against the deployed URL with SMOKE_BASE set.

const assert = require('assert');
const { chromium } = require('playwright');

const FIXTURE =
  'The 1998 Lancet paper (10.1016/S0140-6736(97)11096-0; PMID: 9500320) reported a link that was ' +
  'later disputed. Unrelated: 10.9999/does-not-exist-xyz.';

(async () => {
  const base = process.env.SMOKE_BASE || 'http://127.0.0.1:8765/';
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 950 } });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));

    // ---- index: check flow ----
    let response = await page.goto(base, { waitUntil: 'networkidle' });
    assert(response.ok(), `index returned ${response.status()}`);
    await page.waitForFunction(() => document.querySelectorAll('#stats .stat').length === 5);
    await page.waitForFunction(() => /snapshot fetched/i.test(document.getElementById('snapshotLine').textContent));

    await page.fill('#pasteBox', FIXTURE);
    await page.click('#checkBtn');
    // two identifiers carry notices (DOI + PMID -> the same two records), one DOI does not
    await page.waitForFunction(() => document.querySelectorAll('#results .badge.retraction').length >= 1, null, { timeout: 60000 });
    await page.waitForFunction(() => document.querySelectorAll('#results .badge.correction').length >= 1);
    await page.waitForFunction(() => /No retraction notice found/.test(document.getElementById('results').textContent));
    const summary = await page.$eval('#output .summary', el => el.textContent);
    assert(/Checked\s+3\s+identifiers/.test(summary), `summary should report 3 identifiers: "${summary}"`);
    assert(/2\s*carry/.test(summary), `summary should report 2 flagged identifiers: "${summary}"`);

    // ---- search flow ----
    response = await page.goto(base + 'search.html', { waitUntil: 'networkidle' });
    assert(response.ok(), `search page returned ${response.status()}`);
    await page.fill('#q', 'ileal-lymphoid');
    await page.click('#searchBtn');
    await page.waitForFunction(() => document.querySelectorAll('#list .row').length >= 1, null, { timeout: 60000 });
    const rowText = await page.$eval('#list .row', el => el.textContent);
    assert(/Ileal-lymphoid/i.test(rowText), `row should show the Wakefield title: "${rowText}"`);
    await page.click('#list .row');
    await page.waitForSelector('#detail .result[data-record]');
    const detailText = await page.$eval('#detail', el => el.textContent);
    assert(/Retraction|Correction/.test(detailText), 'detail card should carry a notice badge');

    // ---- method page ----
    response = await page.goto(base + 'method.html', { waitUntil: 'networkidle' });
    assert(response.ok(), `method page returned ${response.status()}`);
    await page.waitForFunction(() => document.querySelectorAll('#receiptsTable tbody tr').length === 5);
    const methodText = await page.$eval('.wrap', el => el.textContent);
    assert(/Retraction Watch Database/.test(methodText), 'attribution missing');

    assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
    console.log('[smoke] all checks passed');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
