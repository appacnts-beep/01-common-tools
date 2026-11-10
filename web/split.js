(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RequestSplitter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const titlePattern = /^(?<committee>\S+위원회)\s+(?<member>.+?)\s+의원실\s+자료요구서$/;
  const deadlinePattern = /제출기한:\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./;
  const itemPattern = /^(\d+)\.\s*(.*)$/;
  const subitemPattern = /^([가-힣])\.\s*(.*)$/;
  const notePattern = /^※\s*(.*)$/;

  function joinText(oldText, newText, separator = " ") {
    const parts = [String(oldText || "").trim(), String(newText || "").trim()].filter(Boolean);
    return parts.join(separator);
  }

  function splitRequestText(text, fileName = "") {
    const lines = String(text)
      .replace(/\u0000/g, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) throw new Error(`${fileName || "PDF"}: 글자를 읽을 수 없습니다.`);
    const title = lines[0].match(titlePattern);
    if (!title) throw new Error(`${fileName || "PDF"}: 첫 줄 형식을 확인해 주세요.`);

    const items = [];
    let deadline = "";
    let current = null;
    let currentField = "요구내용";

    for (const line of lines.slice(1)) {
      if (line.startsWith("수신:")) {
        const match = line.match(deadlinePattern);
        if (!match) throw new Error(`${fileName || "PDF"}: 제출기한 형식을 확인해 주세요.`);
        deadline = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
        continue;
      }
      if (line.startsWith("담당 보좌관:") || line === "끝.") continue;

      const item = line.match(itemPattern);
      if (item) {
        current = {
          파일명: fileName,
          위원회: title.groups.committee,
          의원: title.groups.member.trim(),
          제출기한: deadline,
          문항번호: Number(item[1]),
          요구내용: item[2].trim(),
          세부항목: "",
          비고: "",
        };
        items.push(current);
        currentField = "요구내용";
        continue;
      }
      if (!current) continue;

      const subitem = line.match(subitemPattern);
      if (subitem) {
        currentField = "세부항목";
        current[currentField] = joinText(
          current[currentField],
          `${subitem[1]}. ${subitem[2].trim()}`,
          " / "
        );
        continue;
      }

      const note = line.match(notePattern);
      if (note) {
        currentField = "비고";
        current[currentField] = joinText(current[currentField], note[1]);
        continue;
      }
      current[currentField] = joinText(current[currentField], line);
    }

    if (!deadline) throw new Error(`${fileName || "PDF"}: 제출기한을 찾지 못했습니다.`);
    if (!items.length) throw new Error(`${fileName || "PDF"}: 문항을 찾지 못했습니다.`);
    return items;
  }

  function verifyItems(items, fileName = "") {
    const expectedMatch = String(fileName).match(/_(\d+)문항\.pdf$/i);
    const expected = expectedMatch ? Number(expectedMatch[1]) : null;
    const numbers = items.map((item) => Number(item.문항번호));
    const continuous = numbers.every((number, index) => number === index + 1);
    const lastNumber = numbers.at(-1) || 0;
    return {
      파일명: fileName,
      파일명의문항수: expected,
      뽑은문항수: items.length,
      마지막번호: lastNumber,
      번호연속: continuous,
      일치: expected === null ? continuous : continuous && expected === items.length && expected === lastNumber,
    };
  }

  return { splitRequestText, verifyItems };
});
