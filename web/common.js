(function (root) {
  "use strict";

  const STORAGE_KEY = "assembly-request-cases-v1";

  function parseCsv(text) {
    if (!root.Papa) throw new Error("Papa Parse를 불러오지 못했습니다.");
    const result = root.Papa.parse(String(text).replace(/^\uFEFF/, ""), {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) => header.trim(),
    });
    if (result.errors.length) throw new Error(`CSV 형식을 확인해 주세요: ${result.errors[0].message}`);
    return result.data;
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
