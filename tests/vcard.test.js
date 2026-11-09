const assert = require("assert");
const fs = require("fs");
const { parse } = require("../vcard.js");
const c = parse(fs.readFileSync(__dirname + "/sample.vcf", "utf8"));
assert.strictEqual(c.length, 3);
assert.strictEqual(c[0].name, "Rahul Sharma");
assert.deepStrictEqual(c[0].phones, ["+91 98765 43210"]);
assert.strictEqual(c[0].birthday, "1990-05-12");
assert.strictEqual(c[0].org, "Acme Traders, Sales");
assert.strictEqual(c[0].note, "Met at Surat expo, loves cricket");
assert.strictEqual(c[0].props.find((p) => p.name === "X-ABLABEL").group, "ITEM1");
assert.strictEqual(c[1].name, "अजय शर्मा");
assert.deepStrictEqual(c[1].phones, ["099887 76655", "0261 2345678"]);
assert.strictEqual(c[1].props.find((p) => p.name === "TEL").params.TYPE, "CELL");
assert.strictEqual(c[2].note, "This is a very long note that has been folded across two lines by the exporter");
console.log("vcard tests passed:", c.length, "contacts");

// ---- editing ----
const V = require("../vcard.js");
assert.deepStrictEqual(V.parseDate("1990-05-12"), { y: "1990", m: 5, d: 12 });
assert.deepStrictEqual(V.parseDate("19900512"), { y: "1990", m: 5, d: 12 });
assert.deepStrictEqual(V.parseDate("--05-12"), { y: "", m: 5, d: 12 });
assert.deepStrictEqual(V.parseDate("1604-05-12"), { y: "", m: 5, d: 12 });
assert.strictEqual(V.formatDate({ y: "", m: 5, d: 2 }), "--05-02");
assert.strictEqual(V.formatDate({ y: "2001", m: 11, d: 30 }), "2001-11-30");
assert.strictEqual(V.formatDate({ y: "2001", m: 0, d: 0 }), "");

const e = parse(fs.readFileSync(__dirname + "/sample.vcf", "utf8"))[0];
V.setAnniversary(e, { y: "2015", m: 2, d: 14 });
V.setSimple(e, "TITLE", "Owner, Textiles; Surat");
V.setSimple(e, "NOTE", "line1\nline2");
V.setBirthday(e, { y: "", m: 7, d: 4 });
V.setName(e, "Rahul Kumar Sharma");
V.recompute(e);
assert.strictEqual(e.anniversary, "2015-02-14");
// item1 was already used by X-ABLabel in the sample, so new group must be item2
assert.ok(e.props.some((p) => p.group === "ITEM2" && p.name === "X-ABDATE"));
assert.strictEqual(e.title, "Owner, Textiles; Surat");
assert.strictEqual(e.note, "line1\nline2");
assert.strictEqual(e.birthday, "--07-04");
assert.strictEqual(e.name, "Rahul Kumar Sharma");
assert.strictEqual(e.props.find((p) => p.name === "N").value, "Sharma;Rahul Kumar;;;");
V.setAnniversary(e, { y: "", m: 0, d: 0 });
V.recompute(e);
assert.strictEqual(e.anniversary, "");
assert.ok(!e.props.some((p) => p.group === "ITEM2"));
assert.ok(e.props.some((p) => p.name === "X-ABLABEL" && p.group === "ITEM1")); // untouched
console.log("edit tests passed");
