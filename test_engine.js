const fs = require("fs");
const path = require("path");
const engine = require("./web/engine.js");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");

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

  const headers = rows.shift();
  return rows
    .filter((values) => values.some((value) => value.trim()))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

const testPath = path.join(__dirname, "data", "시험_요구문항_40건.csv");
const selectedRulesPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, "data", "배분기준표_소관키워드_304건.csv");
const organizationPath = path.join(__dirname, "data", "A부_조직도_26개과.csv");
engine.loadFromCsvTexts(
  fs.readFileSync(selectedRulesPath, "utf8"),
  fs.readFileSync(organizationPath, "utf8")
);

const { classify } = engine;
const tests = parseCsv(fs.readFileSync(testPath, "utf8"));
const wrong = [];
let firstCorrect = 0;
let topThreeCorrect = 0;

for (const test of tests) {
  const candidates = classify(test["요구내용"]);
  const departments = candidates.map((candidate) => candidate.과);
  const answer = test["정답_배분과"];

  if (departments[0] === answer) {
    firstCorrect += 1;
  }
  if (departments.includes(answer)) {
    topThreeCorrect += 1;
  }
  if (departments[0] !== answer) {
    wrong.push({
      시험번호: test["시험번호"],
      요구내용: test["요구내용"],
      정답: answer,
      "엔진 결과": departments.length ? departments.join(" > ") : "후보 없음",
    });
  }
}

console.log(`1순위 정답 ${firstCorrect}/${tests.length} · 3순위 안 ${topThreeCorrect}/${tests.length}`);
console.log("틀린 문항");
console.table(wrong);
