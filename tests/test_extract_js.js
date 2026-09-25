'use strict';
// Extraction-case tests: assert tests/cases.json against frontend/extract.js.
// Run with: node tests/test_extract_js.js   (exit 0 = pass)
// The SAME case table is asserted against pipeline/extract.py by tests/test_extract.py.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const { extract } = require(path.join(root, 'frontend', 'extract.js'));
const cases = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'cases.json'), 'utf8')).cases;

let fails = 0;
for (const c of cases) {
  const got = extract(c.text);
  try {
    assert.deepStrictEqual(got, c.expect);
  } catch (e) {
    fails++;
    console.error(`FAIL ${c.name}`);
    console.error('  got:', JSON.stringify(got));
    console.error('  exp:', JSON.stringify(c.expect));
  }
}
console.log(`[extract-js] ${cases.length - fails}/${cases.length} cases pass`);
process.exit(fails ? 1 : 0);
