'use strict';
// Identifier extraction from pasted text — DOIs and PMIDs.
//
// This file is one half of a coupled pair: pipeline/extract.py mirrors it
// exactly. tests/cases.json is asserted by BOTH implementations; a differential
// parity pass runs additional fixtures through both and requires zero diffs.
// Rules are documented in pipeline/extract.py — keep them in lockstep.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WS_Extract = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const DOI_RE = /10\.\d{4,9}\/[^\s"<>]+/g;
  const TRAILING_PUNCT = ".,;:!?'\"*]}";
  const PMID_LABEL_RE = /(?:PMID|PubMed(?:\s*ID)?)\s*[:#]?\s*(\d{5,9})\b/gi;
  const PMID_URL_RE = /pubmed\.ncbi\.nlm\.nih\.gov\/(\d{5,9})/gi;
  const DOI_PREFIXES = [
    'https://doi.org/',
    'http://doi.org/',
    'https://dx.doi.org/',
    'http://dx.doi.org/',
    'doi:',
  ];

  function cleanDoi(candidate) {
    let s = candidate;
    while (s.length && TRAILING_PUNCT.indexOf(s[s.length - 1]) !== -1) s = s.slice(0, -1);
    while (s.endsWith(')')) {
      const closed = (s.match(/\)/g) || []).length;
      const open = (s.match(/\(/g) || []).length;
      if (closed > open) s = s.slice(0, -1);
      else break;
    }
    return s;
  }

  function normalizeDoi(doi) {
    let s = doi.trim().toLowerCase();
    for (const prefix of DOI_PREFIXES) {
      if (s.startsWith(prefix)) { s = s.slice(prefix.length); break; }
    }
    return s;
  }

  function normalizePmid(pmid) {
    return String(pmid).replace(/\D/g, '');
  }

  function extract(text) {
    const hits = []; // {pos, kind, value}
    let m;
    DOI_RE.lastIndex = 0;
    while ((m = DOI_RE.exec(text)) !== null) {
      const cleaned = cleanDoi(m[0]);
      if (cleaned.length > 6 && cleaned.indexOf('/') !== -1) {
        hits.push({ pos: m.index, kind: 'doi', value: normalizeDoi(cleaned) });
      }
    }
    PMID_LABEL_RE.lastIndex = 0;
    while ((m = PMID_LABEL_RE.exec(text)) !== null) {
      hits.push({ pos: m.index, kind: 'pmid', value: normalizePmid(m[1]) });
    }
    PMID_URL_RE.lastIndex = 0;
    while ((m = PMID_URL_RE.exec(text)) !== null) {
      hits.push({ pos: m.index, kind: 'pmid', value: normalizePmid(m[1]) });
    }
    hits.sort((a, b) => a.pos - b.pos);

    const dois = [], pmids = [], seen = new Set();
    for (const h of hits) {
      if (!h.value) continue;
      const key = h.kind + ':' + h.value;
      if (seen.has(key)) continue;
      seen.add(key);
      (h.kind === 'doi' ? dois : pmids).push(h.value);
    }
    return { dois, pmids };
  }

  return { extract, cleanDoi, normalizeDoi, normalizePmid, DOI_PREFIXES };
});
