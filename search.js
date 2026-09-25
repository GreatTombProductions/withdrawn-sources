'use strict';
// Withdrawn Sources — search flow: title / author / journal substring search over
// the full snapshot (search index is a ~14 MB one-time on-demand load).
(() => {
  const $ = id => document.getElementById(id);
  let rows = null;
  const LIMIT = 200;

  async function ensureData() {
    if (rows) return;
    $('status').innerHTML = '<span class="spinner"></span>Loading the search index (14 MB — one-time download)…';
    const d = await WS.loadJSON('data/search.json');
    rows = d.rows;
    $('status').textContent = '';
  }

  async function run() {
    const q = ($('q').value || '').trim().toLowerCase();
    if (q.length < 3) {
      $('status').textContent = 'Type at least 3 characters.';
      return;
    }
    await ensureData();
    const matches = [];
    for (const r of rows) {
      if (r[1].toLowerCase().includes(q) || (r[2] && r[2].toLowerCase().includes(q)) || (r[3] && r[3].toLowerCase().includes(q))) {
        matches.push(r);
      }
    }
    matches.sort((a, b) => String(b[4] || '').localeCompare(String(a[4] || '')));
    const shown = matches.slice(0, LIMIT);
    $('status').textContent = matches.length === 0
      ? 'No records match this query in the snapshot.'
      : `${matches.length} matching record${matches.length === 1 ? '' : 's'}${matches.length > LIMIT ? ` — showing the most recent ${LIMIT}` : ''}. Click a row for details.`;

    const list = $('list');
    if (!shown.length) { list.innerHTML = ''; return; }
    list.innerHTML = shown.map(r =>
      `<div class="row" data-id="${r[0]}">` +
      `${WS.natureBadge(r[5])}` +
      `<div class="t">${WS.esc(r[1])}</div>` +
      `<div class="m">${WS.esc([r[2], r[3], r[4]].filter(Boolean).join(' · '))}</div>` +
      `</div>`
    ).join('');
    $('detail').innerHTML = '';
  }

  async function showDetail(id, rowEl) {
    for (const el of document.querySelectorAll('#list .row')) el.style.background = '';
    rowEl.style.background = '#eef4fd';
    const recs = await WS.getRecords([id]);
    const d = recs[id];
    $('detail').innerHTML = d
      ? WS.recordCard(id, d)
      : `<div class="note">Could not load record ${WS.esc(id)} from the shard — try again.</div>`;
    $('detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('searchBtn').addEventListener('click', run);
    $('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
    $('list').addEventListener('click', (e) => {
      const row = e.target.closest('.row[data-id]');
      if (row) showDetail(Number(row.getAttribute('data-id')), row);
    });
  });
})();
