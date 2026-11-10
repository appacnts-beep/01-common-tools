(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
    api.loadDefaultDataForNode();
  } else {
    root.DistributionEngine = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  let rules = [];
  let allowedDepartments = new Set();
  let initialized = false;

  function parseCsv(text) {
    if (typeof globalThis !== "undefined" && globalThis.Papa) {
      const result = globalThis.Papa.parse(String(text).replace(/^\uFEFF/, ""), {
        header: true,
        skipEmptyLines: "greedy",
        transformHeader: (header) => header.trim(),
      });
      if (result.errors.length) throw new Error(`CSV 형식 오류: ${result.errors[0].message}`);
      return result.data;
    }
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
        } else if (char === '"') {
          quoted = false;
        } else {
          field += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\n") {
        row.push(field.replace(/\r$/, ""));
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
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

  function requireColumns(rows, columns, label) {
    if (!rows.length) {
      throw new Error(`${label}에 데이터가 없습니다.`);
    }
    const missing = columns.filter((column) => !(column in rows[0]));
    if (missing.length) {
      throw new Error(`${label}에 필수 열이 없습니다: ${missing.join(", ")}`);
    }
  }

  function loadFromCsvTexts(rulesCsvText, organizationCsvText) {
    const ruleRows = parseCsv(rulesCsvText);
    const organizationRows = parseCsv(organizationCsvText);

    requireColumns(ruleRows, ["과", "키워드", "제외어", "우선순위"], "배분기준표");
    requireColumns(organizationRows, ["과"], "조직도");

    allowedDepartments = new Set(
      organizationRows.map((row) => row["과"].trim()).filter(Boolean)
    );

    rules = ruleRows.map((row) => {
      const priority = Number(row["우선순위"]);
      if (!Number.isFinite(priority)) {
        throw new Error(`우선순위가 숫자가 아닙니다: ${row["우선순위"]}`);
      }
      return {
        department: row["과"].trim(),
        keyword: row["키워드"].trim(),
        exclusions: row["제외어"].split("|").map((value) => value.trim()).filter(Boolean),
        priority,
      };
    });

    initialized = true;
    return { ruleCount: rules.length, departmentCount: allowedDepartments.size };
  }

  function normalize(value) {
    return String(value).trim().toLocaleLowerCase("ko-KR");
  }

  function classify(requestText) {
    if (!initialized) {
      throw new Error("배분기준표와 조직도를 먼저 불러와야 합니다.");
    }
    if (typeof requestText !== "string" || !requestText.trim()) {
      throw new TypeError("요구내용을 한 글자 이상 입력해 주세요.");
    }

    const normalizedRequest = normalize(requestText);
    const candidates = new Map();

    for (const rule of rules) {
      if (!rule.keyword || !allowedDepartments.has(rule.department)) {
        continue;
      }

      const keyword = normalize(rule.keyword);
      const hasExclusion = rule.exclusions.some((word) => normalizedRequest.includes(normalize(word)));
      if (!normalizedRequest.includes(keyword) || hasExclusion) {
        continue;
      }

      const score = rule.priority + rule.keyword.length / 10;
      const current = candidates.get(rule.department);

      if (!current) {
        candidates.set(rule.department, {
          과: rule.department,
          점수: score,
          근거키워드: new Set([rule.keyword]),
        });
      } else {
        current.점수 = Math.max(current.점수, score);
        current.근거키워드.add(rule.keyword);
      }
    }

    return [...candidates.values()]
      .sort((left, right) => right.점수 - left.점수 || left.과.localeCompare(right.과, "ko"))
      .slice(0, 3)
      .map((candidate) => ({
        과: candidate.과,
        점수: Number(candidate.점수.toFixed(1)),
        근거키워드: [...candidate.근거키워드].sort((a, b) => b.length - a.length || a.localeCompare(b, "ko")),
      }));
  }

  async function init(options = {}) {
    if (typeof fetch !== "function") {
      throw new Error("브라우저 fetch를 사용할 수 없습니다.");
    }

    const rulesUrl = options.rulesUrl || "../data/배분기준표_소관키워드_304건.csv";
    const organizationUrl = options.organizationUrl || "../data/A부_조직도_26개과.csv";
    const [rulesResponse, organizationResponse] = await Promise.all([fetch(rulesUrl), fetch(organizationUrl)]);

    if (!rulesResponse.ok || !organizationResponse.ok) {
      throw new Error(`CSV를 불러오지 못했습니다: ${rulesResponse.status}, ${organizationResponse.status}`);
    }

    return loadFromCsvTexts(await rulesResponse.text(), await organizationResponse.text());
  }

  function loadDefaultDataForNode() {
    if (typeof require !== "function") {
      return;
    }
    const fs = require("fs");
    const path = require("path");
    const dataDirectory = path.resolve(__dirname, "..", "data");
    const rulesCsv = fs.readFileSync(path.join(dataDirectory, "배분기준표_소관키워드_304건.csv"), "utf8");
    const organizationCsv = fs.readFileSync(path.join(dataDirectory, "A부_조직도_26개과.csv"), "utf8");
    loadFromCsvTexts(rulesCsv, organizationCsv);
  }

  return { classify, init, loadFromCsvTexts, loadDefaultDataForNode };
});
