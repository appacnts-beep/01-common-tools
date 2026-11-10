(function (root) {
  "use strict";

  const STORAGE_KEY = "assembly-request-cases-v1";

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    const source = String(text).replace(/^\uFEFF/, "");

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (quoted) {
        if (char === '"' && source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (char === '"') quoted = false;
        else field += char;
      } else if (char === '"') quoted = true;
      else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\n") {
        row.push(field.replace(/\r$/, ""));
        rows.push(row);
        row = [];
        field = "";
      } else field += char;
    }
    if (field || row.length) {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
    }

    const headers = rows.shift() || [];
    return rows
      .filter((values) => values.some((value) => value.trim()))
      .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
  }

  async function fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} 자료를 읽지 못했습니다(${response.status}).`);
    return response.text();
  }

  async function fetchCsv(url) {
    return parseCsv(await fetchText(url));
  }

  function loadCases() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function saveCases(cases) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
    root.dispatchEvent(new CustomEvent("cases:changed", { detail: cases }));
  }

  function caseId(item) {
    return `${item.파일명}::${item.문항번호}`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    })[char]);
  }

  function statusCounts(cases = loadCases()) {
    return cases.reduce((counts, item) => {
      counts[item.상태 || "접수"] = (counts[item.상태 || "접수"] || 0) + 1;
      return counts;
    }, {});
  }

  root.AppCommon = { parseCsv, fetchText, fetchCsv, loadCases, saveCases, caseId, escapeHtml, statusCounts };
})(globalThis);
