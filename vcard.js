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
    return c;
  }

  const api = { parse };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.VCard = api;
})(typeof self !== "undefined" ? self : this);
