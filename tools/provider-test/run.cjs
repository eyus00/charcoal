// Usage: node run.cjs <providersDir> <outJson>
const fs = require('fs'), path = require('path'), Module = require('module');
const dir = process.argv[2], out = process.argv[3];
// Resolve provider requires from this harness's node_modules.
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
  try { return origResolve.call(this, req, parent, ...rest); } catch { return origResolve.call(this, req, module, ...rest); }
};
const TARGETS = [ ['movie', '27205'], ['tv', '1399', 1, 1] ];
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
async function probe(s) {
  const h = { 'User-Agent': UA, ...(s.headers || {}) };
  try {
    const r = await withTimeout(fetch(s.url, { headers: { ...h, Range: 'bytes=0-2047' }, redirect: 'follow' }), 15000);
    const ct = r.headers.get('content-type') || '';
    const buf = Buffer.from(await r.arrayBuffer());
    const txt = buf.toString('utf8', 0, 300);
    if (/<title>[^<]*(Attention Required|Just a moment)/i.test(txt)) return { ok: false, why: `${r.status} bot-check` };
    if (txt.startsWith('#EXTM3U')) {
      // follow to first media playlist / segment
      const base = r.url; const lines = buf.toString('utf8').split('\n').filter((l) => l && !l.startsWith('#'));
      if (!lines[0]) return { ok: r.ok, why: `${r.status} playlist(empty)` };
      const next = new URL(lines[0].trim(), base).href;
      const r2 = await withTimeout(fetch(next, { headers: { ...h, Range: 'bytes=0-2047' } }), 15000);
      const b2 = Buffer.from(await r2.arrayBuffer()); const t2 = b2.toString('utf8', 0, 200);
      if (t2.startsWith('#EXTM3U')) {
        const l2 = b2.toString('utf8').split('\n').filter((l) => l && !l.startsWith('#'));
        if (!l2[0]) return { ok: r2.ok, why: `${r2.status} sub-playlist(empty)` };
        const seg = new URL(l2[0].trim(), r2.url).href;
        const r3 = await withTimeout(fetch(seg, { headers: { ...h, Range: 'bytes=0-2047' } }), 15000);
        const b3 = Buffer.from(await r3.arrayBuffer());
        return { ok: r3.ok && !/<html/i.test(b3.toString('utf8', 0, 200)), why: `segment ${r3.status} ${b3.length}B` };
      }
      return { ok: r2.ok && !/<html/i.test(t2), why: `segment ${r2.status} ${b2.length}B` };
    }
    return { ok: r.ok && !/text\/html/.test(ct), why: `${r.status} ${ct} ${buf.length}B` };
  } catch (e) { return { ok: false, why: e.message.slice(0, 80) }; }
}
(async () => {
  const results = {};
  const only = process.argv[4] ? process.argv[4].split(',') : null;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const id = f.replace('.js', ''); if (only && !only.includes(id)) continue;
    results[id] = {};
    let mod; try { mod = require(path.join(dir, f)); } catch (e) { results[id].load = e.message.slice(0, 100); continue; }
    for (const [type, tmdb, s, ep] of TARGETS) {
      const key = type;
      try {
        const streams = (await withTimeout(Promise.resolve(mod.getStreams(tmdb, type, s, ep)), 45000)) || [];
        const probes = [];
        for (const st of streams.slice(0, 3)) probes.push({ q: st.quality, fmt: (st.url.match(/\.(m3u8|mp4|mkv|mpd)/) || [])[1] || '?', ...(await probe(st)) });
        results[id][key] = { found: streams.length, probes };
      } catch (e) { results[id][key] = { error: e.message.slice(0, 100) }; }
      process.stderr.write(`${id} ${key}: ${JSON.stringify(results[id][key]).slice(0, 220)}\n`);
    }
  }
  fs.writeFileSync(out, JSON.stringify(results, null, 1));
})();
