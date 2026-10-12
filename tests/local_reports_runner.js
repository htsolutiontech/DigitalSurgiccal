// Chấm tệp kết quả bằng bảng điều khiển bản tĩnh (local_reports.js + engine.js) trên Node.
// node tests/local_reports_runner.js <tệp JSON: mảng tệp kết quả>  -> in mảng {ok, detail|error}
'use strict';
const fs = require('fs'), path = require('path');
const E = require(path.join(__dirname, '..', 'backend', 'static', 'sim', 'engine.js'));
const R = require(path.join(__dirname, '..', 'backend', 'static', 'js', 'local_reports.js'));
const dir = path.join(__dirname, '..', 'scenarios');
const SC = {};
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) { const sc = E.loadScenario(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); SC[sc.id] = sc; }
const files = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = files.map(d => {
  try { const sc = R.validateFile(d, SC); const r = R.build(E, sc, d, R.fileKey(d)); return {ok: true, detail: r.detail}; }
  catch (e) { return {ok: false, error: e.message}; }
});
const sessions = out.filter(x => x.ok).map(x => ({...x.detail, assessment: null}));
process.stdout.write(JSON.stringify({items: out, summary: R.summarize(E, SC, sessions, null),
  summary_m5: R.summarize(E, SC, sessions, 'm5_lap_appendectomy_ntp'), csv: R.csv(sessions)}));
