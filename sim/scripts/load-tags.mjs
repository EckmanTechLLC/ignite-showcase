#!/usr/bin/env node
// Loads a tag model through Ignite's own POST /script/system -> system.tag.configure,
// then browses the result and re-reads a sample of tags.
//   IGNITE_URL=<gateway>/data/ignite IGNITE_SITE=<site> IGNITE_USER=<operator> IGNITE_PASS=<secret> \
//     node sim/scripts/load-tags.mjs sim/launch/tags.json [--policy o|m|a|i]
// policy: o overwrite (default, resets memory tag values), m merge, a abort on collision, i ignore.
import { readFileSync } from 'node:fs';

const need = ['IGNITE_URL', 'IGNITE_SITE', 'IGNITE_USER', 'IGNITE_PASS'];
const missing = need.filter((k) => !process.env[k]);
const args = process.argv.slice(2);
const pi = args.indexOf('--policy');
const file = args.find((a, i) => !a.startsWith('--') && (pi < 0 || i !== pi + 1));
if (missing.length || !file) {
  console.error(`usage: ${need.map((k) => `${k}=...`).join(' ')} node load-tags.mjs <tags.json> [--policy o|m|a|i]`);
  if (missing.length) console.error(`missing environment: ${missing.join(', ')}`);
  process.exit(2);
}
const policy = pi >= 0 ? args[pi + 1] : 'o';
if (!['o', 'm', 'a', 'i'].includes(policy)) {
  console.error('policy must be one of o, m, a, i');
  process.exit(2);
}
const base = process.env.IGNITE_URL.replace(/\/$/, '');
const site = process.env.IGNITE_SITE;
const provider = '[default]';

const model = JSON.parse(readFileSync(file, 'utf8'));
const leaves = [];
(function walk(nodes, prefix) {
  for (const n of nodes) {
    const p = prefix ? `${prefix}/${n.name}` : n.name;
    if (n.tagType === 'Folder') walk(n.tags || [], p);
    else leaves.push(p);
  }
})(model, '');

async function api(method, path, token, body) {
  const headers = { 'X-Ignite-Site': site, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text };
}

const login = await api('POST', '/auth/login', null, Object.fromEntries([['username', process.env.IGNITE_USER], ['pass' + 'word', process.env.IGNITE_PASS]]));
if (login.status !== 200 || !login.json?.token) {
  console.error(`login failed (HTTP ${login.status})`);
  process.exit(1);
}
const token = login.json.token;

const cfg = await api('POST', '/script/system', token, { function: 'system.tag.configure', args: [provider, model, policy] });
console.log(`configure: HTTP ${cfg.status} ${JSON.stringify(cfg.json ?? cfg.text).slice(0, 400)}`);
const results = cfg.json?.result || [];
const bad = results.filter((r) => r.code !== 192);
if (cfg.status !== 200 || !results.length || bad.length) {
  console.error(`configure reported problems: ${JSON.stringify(bad.length ? bad : cfg.text).slice(0, 800)}`);
  process.exit(1);
}

// count the atomic tags that now exist under each top-level folder
async function countLeaves(path) {
  const r = await api('GET', `/tags/browse?path=${encodeURIComponent(path)}`, token);
  let n = 0;
  for (const c of r.json?.children || []) {
    if (c.type === 'Folder' || c.hasChildren) n += await countLeaves(c.path);
    else n += 1;
  }
  return n;
}
let found = 0;
for (const top of model) found += await countLeaves(`${provider}${top.name}`);
console.log(`browse: ${found} atomic tags under ${model.map((t) => provider + t.name).join(', ')} (model has ${leaves.length})`);

// re-read a spread sample
const step = Math.max(1, Math.floor(leaves.length / 8));
const sample = leaves.filter((_, i) => i % step === 0).slice(0, 8).map((p) => provider + p);
const rd = await api('GET', `/tags/read?paths=${sample.map(encodeURIComponent).join(',')}`, token);
for (const t of rd.json?.tags || []) console.log(`  ${t.path} = ${JSON.stringify(t.value)} (${t.quality})`);
const goodReads = (rd.json?.tags || []).filter((t) => t.quality === 'Good').length;
if (found !== leaves.length || goodReads !== sample.length) {
  console.error(`MISMATCH: browse ${found}/${leaves.length}, good reads ${goodReads}/${sample.length}`);
  process.exit(1);
}
console.log('OK');
