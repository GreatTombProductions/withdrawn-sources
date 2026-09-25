'use strict';
// Shared helpers for Withdrawn Sources pages (check + search + method).
//
// Record detail is a COMPACT ARRAY — accessor order is a build contract and
// mirrors pipeline/build.py:
//   [0] title [1] authors[] [2] journal [3] publisher [4] nature
//   [5] retraction_date [6] retraction_doi [7] retraction_pmid
//   [8] original_date [9] original_doi [10] original_pmid
//   [11] reasons[] [12] urls[] [13] article_type [14] notes [15] country
const WS = (() => {
  async function loadJSON(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error(`failed to load ${path}: ${r.status}`);
    return r.json();
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const NATURE_CLASS = {
    'Retraction': 'retraction',
    'Expression of concern': 'eoc',
    'Correction': 'correction',
    'Reinstatement': 'reinstatement',
  };
  const NATURE_RANK = ['Retraction', 'Expression of concern', 'Correction', 'Reinstatement'];

  function natureBadge(nature) {
    const cls = NATURE_CLASS[nature] || 'none';
    return `<span class="badge ${cls}">${esc(nature || 'Unknown')}</span>`;
  }

  function natureRank(nature) {
    const i = NATURE_RANK.indexOf(nature);
    return i === -1 ? 99 : i;
  }

  // ---- compact-array accessors ------------------------------------------
  const detTitle = d => d[0], detAuthors = d => d[1], detJournal = d => d[2],
    detPublisher = d => d[3], detNature = d => d[4], detRetDate = d => d[5],
    detRetDoi = d => d[6], detRetPmid = d => d[7], detOrigDate = d => d[8],
    detOrigDoi = d => d[9], detOrigPmid = d => d[10], detReasons = d => d[11],
    detUrls = d => d[12], detArticleType = d => d[13], detNotes = d => d[14],
    detCountry = d => d[15];

  // ---- record shards (id % 100), fetched once and cached -----------------
  const N_SHARDS = 100;
  const shardCache = {};

  async function fetchShard(nn) {
    if (!shardCache[nn]) {
      shardCache[nn] = await loadJSON(`data/records/rec-${nn}.json`);
    }
    return shardCache[nn];
  }

  async function getRecords(ids) {
    const out = {};
    for (const id of ids) {
      const nn = String(id % N_SHARDS).padStart(2, '0');
      const shard = await fetchShard(nn);
      const rec = shard[String(id)];
      if (rec) out[id] = rec;
    }
    return out;
  }

  // ---- links -------------------------------------------------------------
  function doiLink(doi) {
    if (!doi) return '';
    return `<a href="https://doi.org/${encodeURIComponent(doi)}" target="_blank" rel="noopener">${esc(doi)}</a>`;
  }
  function pmidLink(pmid) {
    if (!pmid) return '';
    return `<a href="https://pubmed.ncbi.nlm.nih.gov/${esc(pmid)}/" target="_blank" rel="noopener">PMID ${esc(pmid)}</a>`;
  }

  function fmtDate(v) {
    if (!v) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) return esc(v);
    return `${m[1]}-${m[2]}-${m[3]}`;
  }

  function authorLine(authors, max = 6) {
    if (!authors || !authors.length) return '';
    const shown = authors.slice(0, max).map(esc).join(', ');
    const rest = authors.length - max;
    return shown + (rest > 0 ? ` (+${rest} more)` : '');
  }

  // ---- record card -------------------------------------------------------
  // One notice record, rendered for either the check flow or the search flow.
  function recordCard(id, d) {
    const parts = [];
    const nature = detNature(d);
    const cls = nature === 'Retraction' ? 'flag' : (nature === 'Reinstatement' ? 'clear' : 'unknown');
    parts.push(`<article class="result ${cls}" data-record="${esc(id)}">`);
    parts.push(`<div class="idline">Record ${esc(id)} · Retraction Watch Database</div>`);
    const date = fmtDate(detRetDate(d));
    parts.push(`<div>${natureBadge(nature)}${date ? `<span class="meta">notice dated ${esc(date)}</span>` : ''}</div>`);
    if (detTitle(d)) parts.push(`<div class="title">${esc(detTitle(d))}</div>`);
    const metaBits = [];
    if (detJournal(d)) metaBits.push(esc(detJournal(d)));
    if (detPublisher(d)) metaBits.push(esc(detPublisher(d)));
    if (detArticleType(d)) metaBits.push(esc(detArticleType(d)));
    if (metaBits.length) parts.push(`<div class="meta">${metaBits.join(' · ')}</div>`);
    const authors = detAuthors(d);
    if (authors && authors.length) parts.push(`<div class="meta">${authorLine(authors)}</div>`);
    const reasons = detReasons(d);
    if (reasons && reasons.length) {
      parts.push(`<div class="chips">${reasons.map(r => `<span class="chip">${esc(r)}</span>`).join('')}</div>`);
    }
    const linkBits = [];
    if (detRetDoi(d)) linkBits.push(`Retraction notice: ${doiLink(detRetDoi(d))}`);
    if (detOrigDoi(d)) linkBits.push(`Original paper: ${doiLink(detOrigDoi(d))}`);
    if (detRetPmid(d)) linkBits.push(pmidLink(detRetPmid(d)));
    if (detOrigPmid(d)) linkBits.push(pmidLink(detOrigPmid(d)));
    const urls = detUrls(d);
    if (urls && urls.length) {
      linkBits.push(urls.slice(0, 3).map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">context</a>`).join(' · '));
    }
    if (linkBits.length) parts.push(`<div class="meta">${linkBits.join(' · ')}</div>`);
    if (detNotes(d)) parts.push(`<div class="meta small">Note: ${esc(detNotes(d))}</div>`);
    parts.push('</article>');
    return parts.join('\n');
  }

  return {
    loadJSON, esc, natureBadge, natureRank, NATURE_RANK, NATURE_CLASS,
    detTitle, detAuthors, detJournal, detPublisher, detNature, detRetDate,
    detRetDoi, detRetPmid, detOrigDate, detOrigDoi, detOrigPmid, detReasons,
    detUrls, detArticleType, detNotes, detCountry,
    getRecords, doiLink, pmidLink, fmtDate, authorLine, recordCard,
  };
})();

if (typeof module === 'object' && module.exports) module.exports = WS;
