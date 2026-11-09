// vCard parser. Keeps every property so export can write back unknown fields untouched.
(function (root) {
  function decodeQP(str, charset) {
    const bytes = [];
    const s = str.replace(/=\n/g, "");
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(s.substr(i + 1, 2))) {
        bytes.push(parseInt(s.substr(i + 1, 2), 16));
        i += 2;
      } else {
        bytes.push(s.charCodeAt(i) & 0xff);
      }
    }
    try {
      return new TextDecoder(charset || "utf-8").decode(new Uint8Array(bytes));
    } catch (e) {
      return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
    }
  }

  function unescapeText(v) {
    return v.replace(/\\([nN,;\\])/g, (m, c) => (c === "n" || c === "N" ? "\n" : c));
  }

  function splitUnescaped(v, sep) {
    const out = [];
    let cur = "";
    for (let i = 0; i < v.length; i++) {
      if (v[i] === "\\" && i + 1 < v.length) { cur += v[i] + v[i + 1]; i++; }
      else if (v[i] === sep) { out.push(cur); cur = ""; }
      else cur += v[i];
    }
    out.push(cur);
    return out;
  }

  function unfold(text) {
    text = text.replace(/\r\n?/g, "\n");
    // quoted-printable soft line breaks: line ends with "=" and the property is QP
    const lines = text.split("\n");
    const merged = [];
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (/QUOTED-PRINTABLE/i.test(line.split(":")[0] || "")) {
        while (line.endsWith("=") && i + 1 < lines.length) { line = line.slice(0, -1) + lines[++i]; }
      }
      merged.push(line);
    }
    return merged.join("\n").replace(/\n[ \t]/g, "");
  }

  function parseLine(line) {
    // name[;params]:value  -- colon inside quoted param values is ignored
    let inQ = false, idx = -1;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') inQ = !inQ;
      else if (line[i] === ":" && !inQ) { idx = i; break; }
    }
    if (idx < 0) return null;
    const head = line.slice(0, idx);
    let value = line.slice(idx + 1);
    const parts = splitUnescaped(head, ";");
    let name = parts.shift().toUpperCase();
    let group = "";
    const dot = name.indexOf(".");
    if (dot >= 0) { group = name.slice(0, dot); name = name.slice(dot + 1); }
    const params = {};
    let qp = false, charset = "";
    parts.forEach((p) => {
      const eq = p.indexOf("=");
      let k, v;
      if (eq < 0) { k = "TYPE"; v = p; } else { k = p.slice(0, eq).toUpperCase(); v = p.slice(eq + 1); }
      v = v.replace(/^"|"$/g, "");
      if (k === "ENCODING" && /QUOTED-PRINTABLE/i.test(v)) { qp = true; return; }
      if (k === "CHARSET") { charset = v; return; }
      params[k] = params[k] ? params[k] + "," + v : v;
    });
    if (qp) value = decodeQP(value, charset);
    return { group, name, params, value };
  }

  function parse(text) {
    text = unfold(text.replace(/^﻿/, ""));
    const contacts = [];
    let cur = null;
    text.split("\n").forEach((line) => {
      if (!line.trim()) return;
      const u = line.trim().toUpperCase();
      if (u === "BEGIN:VCARD") { cur = { props: [] }; return; }
      if (u === "END:VCARD") { if (cur) contacts.push(finish(cur)); cur = null; return; }
      if (!cur) return;
      const p = parseLine(line);
      if (p) cur.props.push(p);
    });
    return contacts;
  }

  function first(c, name) { return c.props.find((p) => p.name === name); }
  function all(c, name) { return c.props.filter((p) => p.name === name); }

  function finish(c) {
    const fn = first(c, "FN");
    const n = first(c, "N");
    let name = fn ? unescapeText(fn.value).trim() : "";
    if (!name && n) {
      const [family = "", given = "", additional = "", prefix = "", suffix = ""] = splitUnescaped(n.value, ";").map(unescapeText);
      name = [prefix, given, additional, family, suffix].filter(Boolean).join(" ").trim();
    }
    c.name = name;
    c.phones = all(c, "TEL").map((p) => p.value.trim());
    c.emails = all(c, "EMAIL").map((p) => p.value.trim());
    const bday = first(c, "BDAY");
    c.birthday = bday ? bday.value.trim() : "";
    const org = first(c, "ORG");
    c.org = org ? splitUnescaped(org.value, ";").map(unescapeText).filter(Boolean).join(", ") : "";
    const title = first(c, "TITLE");
    c.title = title ? unescapeText(title.value) : "";
    const note = first(c, "NOTE");
    c.note = note ? unescapeText(note.value) : "";
    const ann = findAnniversary(c);
    c.anniversary = ann ? ann.value.trim() : "";
    return c;
  }

  // ---- Editing helpers (write back into props so export keeps everything) ----
  const ANN_LABEL = "_$!<Anniversary>!$_";

  function findAnniversary(c) {
    const direct = first(c, "ANNIVERSARY");
    if (direct) return direct;
    return all(c, "X-ABDATE").find((p) => {
      const lab = c.props.find((q) => q.name === "X-ABLABEL" && q.group === p.group && p.group);
      return lab && /anniversary/i.test(lab.value);
    });
  }

  function esc(s) {
    return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  }

  // "1990-05-12", "19900512", "--05-12", "1604-05-12" (Apple, year hidden) -> {y, m, d}
  function parseDate(value) {
    const v = (value || "").trim();
    let m = v.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
    if (m) return { y: m[1] === "1604" ? "" : m[1], m: +m[2], d: +m[3] };
    m = v.match(/^--(\d{2})-?(\d{2})/);
    if (m) return { y: "", m: +m[1], d: +m[2] };
    return { y: "", m: 0, d: 0 };
  }

  function formatDate({ y, m, d }) {
    if (!m || !d) return "";
    const mm = String(m).padStart(2, "0"), dd = String(d).padStart(2, "0");
    return y ? `${String(y).padStart(4, "0")}-${mm}-${dd}` : `--${mm}-${dd}`;
  }

  function setSimple(c, name, text) {
    c.props = c.props.filter((p) => p.name !== name);
    if (text) c.props.push({ group: "", name, params: {}, value: esc(text) });
  }

  function setName(c, name) {
    c.props = c.props.filter((p) => p.name !== "FN" && p.name !== "N");
    if (!name) return;
    const words = name.trim().split(/\s+/);
    const family = words.length > 1 ? words.pop() : "";
    c.props.push({ group: "", name: "FN", params: {}, value: esc(name) });
    c.props.push({ group: "", name: "N", params: {}, value: `${esc(family)};${esc(words.join(" "))};;;` });
  }

  function setBirthday(c, date) {
    c.props = c.props.filter((p) => p.name !== "BDAY");
    const v = formatDate(date);
    if (v) c.props.push({ group: "", name: "BDAY", params: {}, value: v });
  }

  function setAnniversary(c, date) {
    const old = findAnniversary(c);
    c.props = c.props.filter((p) => {
      if (p.name === "ANNIVERSARY") return false;
      if (old && old.group && p.group === old.group && (p.name === "X-ABDATE" || p.name === "X-ABLABEL")) return false;
      return true;
    });
    const v = formatDate(date);
    if (!v) return;
    const used = new Set(c.props.map((p) => p.group));
    let n = 1;
    while (used.has("ITEM" + n)) n++;
    c.props.push({ group: "ITEM" + n, name: "X-ABDATE", params: {}, value: v });
    c.props.push({ group: "ITEM" + n, name: "X-ABLABEL", params: {}, value: ANN_LABEL });
  }

  const api = { parse, recompute: finish, parseDate, formatDate, setName, setSimple, setBirthday, setAnniversary };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.VCard = api;
})(typeof self !== "undefined" ? self : this);
