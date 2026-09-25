'use strict';
// Withdrawn Sources — check flow: paste text, extract identifiers, match against
// the pinned Retraction Watch snapshot, render per-identifier results.
(() => {
  const $ = id => document.getElementById(id);
  let lookup = null;

  function setStatus(html, spin) {
    $('status').innerHTML = (spin ? '<span class="spinner"></span>' : '') + html;
  }

  async function ensureLookup() {
    if (lookup) return;
    setStatus('Loading identifier index (5.5 MB — one-time download, cached by your browser)…', true);
    lookup = await WS.loadJSON('data/lookup.json');
  }

  async function loadMeta() {
    try {
      const meta = await WS.loadJSON('data/meta.json');
      const c = meta.counts;
      $('stats').innerHTML = [
        ['records', WS.esc(String(c.records))],
        ['retractions', WS.esc(String(c.by_nature['Retraction'] || 0))],
        ['expressions of concern', WS.esc(String(c.by_nature['Expression of concern'] || 0))],
        ['corrections', WS.esc(String(c.by_nature['Correction'] || 0))],
        ['identifiers indexed', WS.esc(String(c.indexed_dois + c.indexed_pmids))],
      ].map(([l, n]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');
      $('snapshotLine').innerHTML =
        `Retraction Watch Database snapshot fetched ${WS.esc(meta.snapshot.fetched_at)} ` +
        `(sha256 <code>${WS.esc(meta.snapshot.sha256.slice(0, 16))}…</code>). ` +
        `Retraction Watch updates the upstream database every working day — see <a href="method.html">Method</a>.`;
    } catch (e) {
      $('snapshotLine').textContent = 'Could not load snapshot metadata.';
    }
  }

  function countNatures(recordsById, ids) {
    const counts = {};
    for (const id of ids) {
      const d = recordsById[id];
      if (!d) continue;
      const n = WS.detNature(d);
      counts[n] = (counts[n] || 0) + 1;
    }
    return counts;
  }

  function render(items, recordsById) {
    const nDois = items.filter(i => i.kind === 'doi').length;
    const nPmids = items.filter(i => i.kind === 'pmid').length;
    const flagged = items.filter(i => i.ids.length > 0);
    const allFlaggedIds = [...new Set(flagged.flatMap(i => i.ids))];
    const counts = countNatures(recordsById, allFlaggedIds);
    const parts = [];

    parts.push('<div class="summary">');
    parts.push(`Checked <strong>${items.length}</strong> identifier${items.length === 1 ? '' : 's'} ` +
      `(${nDois} DOI${nDois === 1 ? '' : 's'}, ${nPmids} PMID${nPmids === 1 ? '' : 's'}). `);
    if (flagged.length) {
      const bd = Object.entries(counts).filter(([, n]) => n > 0).map(([n, c]) => `${c} ${n.toLowerCase()}${c === 1 ? '' : 's'}`).join(', ');
      parts.push(`<strong>${flagged.length}</strong> carr${flagged.length === 1 ? 'ies' : 'y'} update notices in the snapshot (${bd || 'see below'}).`);
    } else {
      parts.push('None carry notices in this snapshot.');
    }
    parts.push('</div>');
    parts.push('<div id="results"></div>');

    const host = document.createElement('div');
    host.innerHTML = parts.join('\n');
    $('output').replaceChildren(...host.childNodes);

    const results = $('results');
    for (const item of items) {
      const block = document.createElement('section');
      if (item.ids.length) {
        const recs = item.ids.map(id => [id, recordsById[id]]).filter(([, d]) => d);
        recs.sort((a, b) => String(WS.detRetDate(a[1]) || '').localeCompare(String(WS.detRetDate(b[1]) || '')));
        block.innerHTML =
          `<h3>${WS.esc(item.kind === 'doi' ? 'DOI' : 'PMID')}: ` +
          `<span class="idline">${WS.esc(item.value)}</span></h3>` +
          recs.map(([id, d]) => WS.recordCard(id, d)).join('\n');
      } else {
        block.innerHTML =
          `<h3>${WS.esc(item.kind === 'doi' ? 'DOI' : 'PMID')}: ` +
          `<span class="idline">${WS.esc(item.value)}</span></h3>` +
          `<div class="result unknown" data-notfound="${WS.esc(item.value)}">` +
          `<div class="meta">No retraction notice found for this identifier in the snapshot — ` +
          `<em>not proof that none exists</em>: the Retraction Watch Database is not exhaustive, ` +
          `and corrections / expressions of concern are less comprehensively covered than retractions. ` +
          `See <a href="method.html">Method</a> for coverage limits.</div>` +
          (item.kind === 'doi'
            ? `<div class="actions"><button class="secondary" data-crossref="${WS.esc(item.value)}">Check Crossref member metadata live</button></div>`
            : `<div class="meta small">For PMID-only lookups, also <a href="https://pubmed.ncbi.nlm.nih.gov/${WS.esc(item.value)}/" target="_blank" rel="noopener">view the PubMed record</a>.</div>`) +
          `</div>`;
      }
      results.appendChild(block);
    }
    setStatus('', false);
  }

  async function check() {
    const text = $('pasteBox').value || '';
    const { dois, pmids } = WS_Extract.extract(text);
    if (!dois.length && !pmids.length) {
      $('output').innerHTML =
        `<div class="note">No DOIs or PMIDs found in this text. This tool checks citations that carry ` +
        `machine-readable identifiers (10.xxxx/… DOIs, PMID labels, PubMed URLs). Author–year citations ` +
        `and plain titles cannot be matched automatically — see <a href="method.html">Method</a>. ` +
        `You can also <a href="search.html">search the database by title, author, or journal</a>.</div>`;
      setStatus('', false);
      return;
    }
    try {
      await ensureLookup();
      const items = [];
      for (const doi of dois) items.push({ kind: 'doi', value: doi, ids: lookup['d:' + doi] || [] });
      for (const pmid of pmids) items.push({ kind: 'pmid', value: pmid, ids: lookup['p:' + pmid] || [] });
      setStatus('Resolving matches…', true);
      const allIds = [...new Set(items.flatMap(i => i.ids))];
      const recordsById = await WS.getRecords(allIds);
      render(items, recordsById);
    } catch (e) {
      setStatus('Something went wrong: ' + WS.esc(String(e && e.message ? e.message : e)), false);
    }
  }

  // Live Crossref check for not-found DOIs (member-deposited metadata only).
  async function crossrefCheck(doi, btn) {
    btn.disabled = true;
    btn.textContent = 'Checking…';
    const block = btn.closest('[data-notfound]');
    try {
      const r = await fetch('https://api.crossref.org/works/' + encodeURIComponent(doi));
      let html;
      if (r.status === 404) {
        html = `Crossref: this DOI is <strong>not registered</strong> with Crossref (no metadata record).`;
      } else if (!r.ok) {
        html = `Crossref check failed (HTTP ${r.status}). Try again later.`;
      } else {
        const j = await r.json();
        const msg = j.message || {};
        const updates = msg['update-to'] || [];
        if (updates.length) {
          const rows = updates.map(u => {
            const type = WS.esc(u.type || 'update');
            const date = (u.updated && u.updated['date-time']) ? String(u.updated['date-time']).slice(0, 10) : '';
            const link = u.DOI ? ` — ${WS.doiLink(String(u.DOI).toLowerCase())}` : '';
            return `<li>${type}${date ? ` (${date})` : ''}${link}</li>`;
          }).join('');
          html = `Crossref member metadata lists an update notice:<ul>${rows}</ul>`;
        } else {
          const title = (msg.title && msg.title[0]) ? ` (title: “${WS.esc(msg.title[0])}”)` : '';
          html = `Crossref member metadata lists <strong>no update notice</strong>${title}. ` +
            `Member-deposited update metadata is incomplete — it is possible for a retracted work to show nothing here ` +
            `(see <a href="method.html">Method</a>).`;
        }
      }
      block.insertAdjacentHTML('beforeend', `<div class="meta small" data-crossref-result>${html}</div>`);
      btn.remove();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Check Crossref member metadata live';
      block.insertAdjacentHTML('beforeend', `<div class="meta small">Crossref check failed: ${WS.esc(String(e))}</div>`);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadMeta();
    $('checkBtn').addEventListener('click', check);
    $('exampleLink').addEventListener('click', (e) => {
      e.preventDefault();
      $('pasteBox').value =
        'Sample text with citations:\n' +
        'The 1998 Lancet paper (10.1016/S0140-6736(97)11096-0; PMID: 9500320) reported a link that was later disputed. ' +
        'For methods, see doi:10.1136/bmj.n71.';
      check();
    });
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-crossref]');
      if (b) crossrefCheck(b.getAttribute('data-crossref'), b);
    });
  });
})();
