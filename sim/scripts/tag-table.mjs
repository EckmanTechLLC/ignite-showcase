#!/usr/bin/env node
// Renders a tag model JSON (system.tag.configure format) as a Markdown table.
//   node sim/scripts/tag-table.mjs <tags.json>                 print the table
//   node sim/scripts/tag-table.mjs <tags.json> --write <md>    replace the block between
//                                                              <!-- tag-table:start --> and <!-- tag-table:end -->
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const file = args[0];
if (!file) {
  console.error('usage: tag-table.mjs <tags.json> [--write <readme.md>]');
  process.exit(2);
}
const wi = args.indexOf('--write');
const target = wi >= 0 ? args[wi + 1] : null;

const rows = [];
function walk(nodes, prefix) {
  for (const n of nodes) {
    const path = prefix ? `${prefix}/${n.name}` : n.name;
    if (n.tagType === 'Folder') {
      walk(n.tags || [], path);
    } else {
      rows.push([path, n]);
    }
  }
}
walk(JSON.parse(readFileSync(file, 'utf8')), '');

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
function alarmText(a) {
  const sp = a.setpointA !== undefined ? ` ${a.setpointA}` : '';
  const cond = a.mode === 'OnCondition' ? ` ${a.activeCondition?.value ?? ''}` : sp;
  const en = a.enabled ? ' when READY' : '';
  return `${a.name}: ${a.mode}${cond}, ${a.priority}${en}${a.label ? ` ("${a.label}")` : ''}`;
}
function historyText(n) {
  if (!n.historyEnabled) return '';
  const db = n.historicalDeadband !== undefined ? `, deadband ${n.historicalDeadband}` : '';
  return `${n.historySampleMode || 'OnChange'}${db}`;
}

const lines = [
  '| Tag | Type | Unit | Initial | Alarms | History | Description |',
  '|---|---|---|---|---|---|---|',
];
for (const [path, n] of rows) {
  const alarms = (n.alarms || []).map(alarmText).join('<br>');
  const initial = n.value === '' ? '""' : n.value;
  lines.push(
    `| ${esc(path)} | ${n.dataType} | ${esc(n.engUnit && n.engUnit !== '-' ? n.engUnit : '')} | ${esc(initial)} | ${esc(alarms)} | ${esc(historyText(n))} | ${esc(n.documentation)} |`,
  );
}
const hist = rows.filter(([, n]) => n.historyEnabled).length;
const alarmCount = rows.reduce((s, [, n]) => s + (n.alarms || []).length, 0);
const summary = `${rows.length} tags, ${hist} with history, ${alarmCount} alarms.`;
const table = `${summary}\n\n${lines.join('\n')}`;

if (!target) {
  console.log(table);
} else {
  const md = readFileSync(target, 'utf8');
  const start = '<!-- tag-table:start -->';
  const end = '<!-- tag-table:end -->';
  const a = md.indexOf(start);
  const b = md.indexOf(end);
  if (a < 0 || b < a) {
    console.error(`markers not found in ${target}`);
    process.exit(1);
  }
  writeFileSync(target, `${md.slice(0, a + start.length)}\n${table}\n${md.slice(b)}`);
  console.log(`updated ${target}: ${summary}`);
}
