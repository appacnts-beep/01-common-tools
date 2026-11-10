const fs = require("fs");
const path = require("path");

const inputPath = path.join(__dirname, "data", "A부_조직도_26개과.csv");
const outputPath = path.join(__dirname, "org.json");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
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

  return rows;
}

const csvText = fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");
const rows = parseCsv(csvText);
const headers = rows.shift();

const requiredHeaders = ["실국", "과", "대표키워드"];
for (const header of requiredHeaders) {
  if (!headers.includes(header)) {
    throw new Error(`필수 열이 없습니다: ${header}`);
  }
}

const column = Object.fromEntries(headers.map((header, index) => [header, index]));
const organizations = rows
  .filter((row) => row.some((value) => value.trim()))
  .map((row) => ({
    실국: row[column["실국"]].trim(),
    과: row[column["과"]].trim(),
    대표키워드: row[column["대표키워드"]]
      .split("|")
      .map((keyword) => keyword.trim())
      .filter(Boolean),
  }));

fs.writeFileSync(outputPath, `${JSON.stringify(organizations, null, 2)}\n`, "utf8");

console.log(`원소 수: ${organizations.length}`);
console.log("첫 원소:");
console.log(JSON.stringify(organizations[0], null, 2));
