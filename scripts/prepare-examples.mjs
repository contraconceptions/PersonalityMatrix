// Turn a client's labeled customer lines into an import file and a held-out test set (NEXT-STEPS §4).
//
//   npm run prepare-examples -- labeled.csv [out-dir]
//
// The CSV needs a header row with `text` and `label_a`, and ideally `label_b` from a second person who
// labeled independently. Labels are customer type ids or names (analytical, "The Demanding", …).
// The tool:
//   1. reports how often the two labelers agreed (percent and Cohen's kappa) and where they disagreed,
//   2. keeps only lines both labeled the same (or all lines when there's a single labeler),
//   3. drops lines that look like they contain personal data (same rules as the in-app import) and
//      warns about ones that might (names, addresses, dates),
//   4. splits the rest per type, ~80% into <out>/client-examples.json (import it in Settings → Guidance
//      content) and ~20% into <out>/client-heldout.json (score it with `npm run eval -- --heldout …`).
// The split is deterministic (by a hash of each line), so re-running gives the same files.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runnerImport } from "vite";

const [input, outDir = "client-data"] = process.argv.slice(2);
if (!input) {
  console.error("Usage: npm run prepare-examples -- labeled.csv [out-dir]");
  process.exit(1);
}

const { module: ex } = await runnerImport("./src/lib/clientExamples.ts");
const customers = JSON.parse(readFileSync("src/data/customerProfiles.json", "utf8"));
const IDS = customers.map((c) => c.id);

/** RFC 4180-ish CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
function parseCsv(src) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") row.push(field), (field = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);
  return rows.filter((r) => r.some((f) => f.trim()));
}

/** "The Demanding", "demanding", "Demanding " → "demanding". */
function label(raw) {
  const s = String(raw ?? "").trim().toLowerCase().replace(/^the\s+/, "");
  if (!s) return null;
  return IDS.find((id) => id === s || customers.find((c) => c.id === id).name.toLowerCase().replace(/^the\s+/, "") === s) ?? "?";
}

const rows = parseCsv(readFileSync(input, "utf8").replace(/^﻿/, ""));
const header = rows.shift().map((h) => h.trim().toLowerCase());
const col = (name) => header.indexOf(name);
if (col("text") < 0 || col("label_a") < 0) {
  console.error(`The CSV needs "text" and "label_a" columns (found: ${header.join(", ")}).`);
  process.exit(1);
}
const twoLabelers = col("label_b") >= 0;
const lines = rows.map((r, i) => ({ row: i + 2, text: (r[col("text")] ?? "").trim(), a: label(r[col("label_a")]), b: twoLabelers ? label(r[col("label_b")]) : null }));

const report = [];
const say = (s = "") => (report.push(s), console.log(s));
say(`${input}: ${lines.length} lines, ${twoLabelers ? "two labelers" : "one labeler (no agreement check possible)"}`);

// Unknown labels.
const unknown = lines.filter((l) => l.a === "?" || l.b === "?");
if (unknown.length) say(`\nUnknown labels on ${unknown.length} rows (use ${IDS.join(", ")}): rows ${unknown.map((l) => l.row).slice(0, 20).join(", ")}`);
let usable = lines.filter((l) => l.text && l.a && l.a !== "?" && (!twoLabelers || (l.b && l.b !== "?")));

// Agreement.
if (twoLabelers) {
  const n = usable.length;
  const agreed = usable.filter((l) => l.a === l.b);
  const po = agreed.length / n;
  const pe = IDS.reduce((s, id) => s + (usable.filter((l) => l.a === id).length / n) * (usable.filter((l) => l.b === id).length / n), 0);
  const kappa = (po - pe) / (1 - pe);
  say(`\nAgreement: ${Math.round(po * 100)}% of ${n} lines, Cohen's kappa ${kappa.toFixed(2)}`);
  say(
    kappa >= 0.6
      ? "  Good enough to use."
      : "  Low: the type definitions are unclear for this client. Review the disagreements below before training on these lines.",
  );
  const pairs = {};
  for (const l of usable.filter((l) => l.a !== l.b)) {
    const k = [l.a, l.b].sort().join(" / ");
    pairs[k] = (pairs[k] ?? 0) + 1;
  }
  const worst = Object.entries(pairs).sort((x, y) => y[1] - x[1]);
  if (worst.length) say("  Most disagreed: " + worst.slice(0, 5).map(([k, c]) => `${k} (${c})`).join(", "));
  usable = agreed;
}

// Personal data: hard errors use the in-app rules; softer patterns are warnings to check by hand.
const WARN = [
  [/\b([Mm]y name is|[Tt]his is|I'?m|I am) [A-Z][a-z]+ [A-Z][a-z]+/, "a full name"],
  [/\b\d{1,5} [A-Za-z]+ (street|st|avenue|ave|road|rd|lane|ln|drive|dr|blvd)\b/i, "a street address"],
  [/\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])[/-](19|20)?\d{2}\b/, "a date"],
];
const dropped = [];
const warned = [];
usable = usable.filter((l) => {
  const errors = [];
  ex.validateExamples({ [l.a]: [l.text] }, undefined, IDS, errors);
  if (errors.length) return dropped.push(`  row ${l.row}: ${errors[0].replace(/^"[^"]+" /, "")}`), false;
  for (const [re, what] of WARN) if (re.test(l.text)) warned.push(`  row ${l.row}: may contain ${what}: ${l.text.slice(0, 80)}`);
  return true;
});
if (dropped.length) say(`\nDropped ${dropped.length} lines that look like they contain personal data:\n${dropped.join("\n")}`);
if (warned.length) say(`\nCheck these by hand before sharing (kept):\n${warned.join("\n")}`);

// Deterministic stratified split: sort each type's lines by hash, every 5th goes to held-out.
const hash = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
};
const train = {};
const heldOut = [];
say("\nPer type (kept → examples / held-out):");
for (const id of IDS) {
  const mine = [...new Set(usable.filter((l) => l.a === id).map((l) => l.text))].sort((x, y) => hash(x) - hash(y));
  const test = mine.filter((_, i) => i % 5 === 4);
  train[id] = mine.filter((_, i) => i % 5 !== 4);
  heldOut.push(...test.map((text) => ({ text, expected: id })));
  const note = mine.length < 10 ? "  ← fewer than 10; add more for this type" : "";
  say(`  ${id.padEnd(12)} ${String(mine.length).padStart(4)} → ${String(train[id].length).padStart(4)} / ${String(test.length).padStart(3)}${note}`);
  if (!train[id].length) delete train[id];
}

mkdirSync(outDir, { recursive: true });
const importFile = {
  format: "personality-matrix-content",
  version: 1,
  customerExamplesMode: "add",
  customerExamples: train,
};
const check = [];
ex.validateExamples(train, "add", IDS, check);
if (check.length) {
  say(`\nThe import file wouldn't pass validation:\n  ${check.join("\n  ")}`);
  process.exitCode = 1;
}
writeFileSync(join(outDir, "client-examples.json"), JSON.stringify(importFile, null, 2) + "\n");
writeFileSync(join(outDir, "client-heldout.json"), JSON.stringify(heldOut, null, 2) + "\n");
say(`\nWrote ${join(outDir, "client-examples.json")} (import in Settings → Guidance content)`);
say(`Wrote ${join(outDir, "client-heldout.json")} (npm run eval -- --examples ${join(outDir, "client-examples.json")} --heldout ${join(outDir, "client-heldout.json")})`);
writeFileSync(join(outDir, "report.txt"), report.join("\n") + "\n");
