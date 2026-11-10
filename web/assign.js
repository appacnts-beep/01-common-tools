import { getDocument, GlobalWorkerOptions } from "./lib/pdf.min.mjs";
GlobalWorkerOptions.workerSrc = "./lib/pdf.worker.min.mjs";

const { escapeHtml, parseCsv, loadCases, saveCases, caseId, fetchCsv } = AppCommon;
const elements = {
  pdf: document.querySelector("#pdf-files"), csv: document.querySelector("#csv-file"),
  register: document.querySelector("#register"), clear: document.querySelector("#clear-preview"),
  previewWrap: document.querySelector("#preview-wrap"), previewBody: document.querySelector("#preview-body"),
  assignmentBody: document.querySelector("#assignment-body"), message: document.querySelector("#import-message"),
  progressWrap: document.querySelector("#progress-wrap"), progress: document.querySelector("#progress"),
  progressLabel: document.querySelector("#progress-label"), dataStatus: document.querySelector("#data-status"),
  caseCount: document.querySelector("#case-count"), summary: document.querySelector("#summary"),
};

let previewItems = [];
let departments = [];

function setMessage(text, kind = "") {
  elements.message.textContent = text;
  elements.message.className = `message ${kind}`.trim();
}

function setProgress(value, label = `${Math.round(value)}%`) {
  elements.progressWrap.classList.add("on");
  elements.progress.value = value;
  elements.progressLabel.textContent = label;
}

async function extractPdf(file, progressStart, progressShare) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const documentTask = getDocument({ data: bytes });
  const pdf = await documentTask.promise;
  const pageTexts = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items) text += `${item.str}${item.hasEOL ? "\n" : " "}`;
    pageTexts.push(text.trim());
    setProgress(progressStart + progressShare * (pageNumber / pdf.numPages), `${file.name} ${pageNumber}/${pdf.numPages}쪽`);
  }
  const items = RequestSplitter.splitRequestText(pageTexts.join("\n"), file.name);
  return { items, check: RequestSplitter.verifyItems(items, file.name) };
}

function renderPreview(checks = []) {
  elements.previewWrap.hidden = previewItems.length === 0;
  elements.register.disabled = previewItems.length === 0;
  elements.clear.disabled = previewItems.length === 0;
  elements.previewBody.innerHTML = previewItems.map((item) => `<tr>
    <td class="meta"><strong>${escapeHtml(item.파일명)}</strong>${escapeHtml(item.문항번호)}번</td>
    <td>${escapeHtml(item.위원회)}<br>${escapeHtml(item.의원)}</td><td>${escapeHtml(item.제출기한)}</td>
    <td class="request">${escapeHtml(item.요구내용)}</td>
    <td>${item.세부항목 ? `<strong>세부</strong> ${escapeHtml(item.세부항목)}<br>` : ""}${item.비고 ? `<strong>비고</strong> ${escapeHtml(item.비고)}` : ""}</td>
  </tr>`).join("");
  if (checks.length) {
    const result = checks.map((check) => `${check.파일명}: ${check.뽑은문항수}문항·${check.일치 ? "일치" : "확인필요"}`).join(" / ");
    setMessage(`${previewItems.length}문항을 읽었습니다. ${result}`, checks.every((check) => check.일치) ? "success" : "error");
  }
}

elements.pdf.addEventListener("change", async () => {
  const files = [...elements.pdf.files];
  if (!files.length) return;
  previewItems = [];
  const checks = [];
  try {
    setProgress(0, "PDF 준비 중");
    for (let index = 0; index < files.length; index += 1) {
      const result = await extractPdf(files[index], index / files.length * 100, 100 / files.length);
      previewItems.push(...result.items);
      checks.push(result.check);
    }
    setProgress(100, "완료");
    renderPreview(checks);
  } catch (error) {
    setMessage(error.message, "error");
  }
});

elements.csv.addEventListener("change", async () => {
  const [file] = elements.csv.files;
  if (!file) return;
  try {
    const rows = parseCsv(await file.text());
    const required = ["파일명", "위원회", "의원", "제출기한", "문항번호", "요구내용", "세부항목", "비고"];
    if (!rows.length || required.some((key) => !(key in rows[0]))) throw new Error("문항목록 CSV의 열을 확인해 주세요.");
    previewItems = rows.map((row) => ({ ...row, 문항번호: Number(row.문항번호) }));
    renderPreview();
    setMessage(`${previewItems.length}문항을 CSV에서 읽었습니다.`, "success");
  } catch (error) { setMessage(error.message, "error"); }
});

elements.clear.addEventListener("click", () => {
  previewItems = [];
  elements.pdf.value = "";
  elements.csv.value = "";
  elements.progressWrap.classList.remove("on");
  setMessage("");
  renderPreview();
});

elements.register.addEventListener("click", () => {
  const cases = loadCases();
  const existing = new Set(cases.map((item) => item.id));
  let added = 0;
  for (const item of previewItems) {
    const id = caseId(item);
    if (existing.has(id)) continue;
    const candidates = DistributionEngine.classify(item.요구내용);
    cases.push({
      ...item, id, 상태: "접수", 후보: candidates,
      주관과: candidates[0]?.과 || "", 협조과: [], 확정방법: "",
      일시: new Date().toISOString(), log: [{ 일시: new Date().toISOString(), 작업: "접수" }],
    });
    existing.add(id);
    added += 1;
  }
  saveCases(cases);
  setMessage(`${added}문항을 접수 등록했습니다.${added < previewItems.length ? ` 중복 ${previewItems.length - added}건은 건너뛰었습니다.` : ""}`, "success");
  renderAssignments();
});

function options(selected = "") {
  return `<option value="">선택</option>${departments.map((department) => `<option${department === selected ? " selected" : ""}>${escapeHtml(department)}</option>`).join("")}`;
}

function renderAssignments() {
  const cases = loadCases();
  elements.caseCount.textContent = `${cases.length}문항`;
  const confirmed = cases.filter((item) => item.상태 === "배분확정").length;
  elements.summary.innerHTML = `<span><strong>${cases.length}</strong>전체</span><span><strong>${cases.length - confirmed}</strong>배분 대기</span><span><strong>${confirmed}</strong>배분확정</span>`;
  if (!cases.length) {
    elements.assignmentBody.innerHTML = `<tr><td colspan="7" class="empty">접수된 문항이 없습니다.</td></tr>`;
    return;
  }
  elements.assignmentBody.innerHTML = cases.map((item) => `<tr data-id="${escapeHtml(item.id)}">
    <td><span class="badge ${item.상태 === "배분확정" ? "confirmed" : ""}">${escapeHtml(item.상태)}</span></td>
    <td class="meta"><strong>${escapeHtml(item.의원)} · ${escapeHtml(item.문항번호)}번</strong>${escapeHtml(item.위원회)}<br>${escapeHtml(item.제출기한)}</td>
    <td class="request">${escapeHtml(item.요구내용)}${item.세부항목 ? `<br><small>${escapeHtml(item.세부항목)}</small>` : ""}</td>
    <td class="candidates">${item.후보.length ? item.후보.map((candidate, index) => `<div class="candidate"><strong>${index + 1}. ${escapeHtml(candidate.과)}</strong> <span>${candidate.점수}</span><small>${escapeHtml(candidate.근거키워드.join(", "))}</small></div>`).join("") : `<span class="badge">확인필요</span>`}</td>
    <td><select class="lead" ${item.상태 === "배분확정" ? "disabled" : ""}>${options(item.주관과)}</select></td>
    <td><select class="support" multiple ${item.상태 === "배분확정" ? "disabled" : ""}>${departments.map((department) => `<option${(item.협조과 || []).includes(department) ? " selected" : ""}>${escapeHtml(department)}</option>`).join("")}</select></td>
    <td><button class="confirm" ${item.상태 === "배분확정" ? "disabled" : ""}>${item.상태 === "배분확정" ? `${escapeHtml(item.확정방법)} 확정` : "배분 확정"}</button></td>
  </tr>`).join("");
}

elements.assignmentBody.addEventListener("click", (event) => {
  const button = event.target.closest(".confirm");
  if (!button) return;
  const row = button.closest("tr");
  const cases = loadCases();
  const item = cases.find((value) => value.id === row.dataset.id);
  const lead = row.querySelector(".lead").value;
  const support = [...row.querySelector(".support").selectedOptions].map((option) => option.value).filter((value) => value !== lead);
  if (!lead || !departments.includes(lead)) { setMessage("주관 과를 선택해 주세요.", "error"); return; }
  item.주관과 = lead;
  item.협조과 = support;
  item.상태 = "배분확정";
  item.확정방법 = item.후보[0]?.과 === lead ? "규칙" : "수정";
  item.일시 = new Date().toISOString();
  item.log = [...(item.log || []), { 일시: item.일시, 작업: "배분", 주관과: lead, 협조과: support, 확정방법: item.확정방법 }];
  saveCases(cases);
  setMessage(`${item.의원} ${item.문항번호}번을 ${lead}로 배분 확정했습니다.`, "success");
  renderAssignments();
});

function enableReveal() {
  const reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
  const targets = document.querySelectorAll("[data-reveal]");
  if (reduce || !("IntersectionObserver" in window)) { targets.forEach((element) => element.classList.add("show")); return; }
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add("show");
    observer.unobserve(entry.target);
  }), { threshold: .12 });
  targets.forEach((element) => observer.observe(element));
}

async function start() {
  try {
    const [organization] = await Promise.all([
      fetchCsv("data/A부_조직도_26개과.csv"),
      DistributionEngine.init({ rulesUrl: "data/rules_보강.csv", organizationUrl: "data/A부_조직도_26개과.csv" }),
    ]);
    departments = organization.map((row) => row.과.trim()).filter(Boolean);
    elements.dataStatus.textContent = `보강규칙 304건 · 조직도 ${departments.length}개 과`;
    elements.dataStatus.classList.add("confirmed");
    renderAssignments();
  } catch (error) {
    elements.dataStatus.textContent = "기준자료 읽기 실패";
    setMessage(`${error.message} 주소를 http://localhost:8000으로 열었는지 확인해 주세요.`, "error");
  }
  enableReveal();
}

start();
