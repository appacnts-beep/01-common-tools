"""원문 자료요구서 PDF를 문항 단위 CSV로 분리한다."""

from __future__ import annotations

import csv
import re
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parent
SOURCE_DIR = ROOT / "원문"
OUTPUT_PATH = ROOT / "data" / "문항목록.csv"
FIELDS = ["파일명", "위원회", "의원", "제출기한", "문항번호", "요구내용", "세부항목", "비고"]

TITLE_RE = re.compile(r"^(?P<committee>\S+위원회)\s+(?P<member>.+?)\s+의원실\s+자료요구서$")
DEADLINE_RE = re.compile(r"제출기한:\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.")
ITEM_RE = re.compile(r"^(\d+)\.\s*(.*)$")
SUBITEM_RE = re.compile(r"^([가-힣])\.\s*(.*)$")
NOTE_RE = re.compile(r"^※\s*(.*)$")
EXPECTED_RE = re.compile(r"_(\d+)문항\.pdf$")


def join_text(old: str, new: str) -> str:
    """빈 값은 건너뛰고 이어지는 줄을 한 칸으로 연결한다."""
    new = new.strip()
    return " ".join(part for part in (old.strip(), new) if part)


def extract_lines(pdf_path: Path) -> list[str]:
    """페이지 경계를 보존해 PDF의 모든 텍스트 줄을 읽는다."""
    reader = PdfReader(pdf_path)
    lines: list[str] = []
    for page in reader.pages:
        text = page.extract_text() or ""
        lines.extend(line.strip() for line in text.splitlines() if line.strip())
    return lines


def parse_pdf(pdf_path: Path) -> list[dict[str, str | int]]:
    lines = extract_lines(pdf_path)
    if not lines:
        raise ValueError(f"텍스트를 읽을 수 없습니다: {pdf_path.name}")

    title_match = TITLE_RE.match(lines[0])
    if not title_match:
        raise ValueError(f"첫 줄 형식을 확인하십시오: {pdf_path.name} / {lines[0]}")

    committee = title_match.group("committee")
    member = title_match.group("member").strip()
    deadline = ""
    items: list[dict[str, str | int]] = []
    current: dict[str, str | int] | None = None
    current_field = "요구내용"

    for line in lines[1:]:
        if line.startswith("수신:"):
            deadline_match = DEADLINE_RE.search(line)
            if not deadline_match:
                raise ValueError(f"제출기한 형식을 확인하십시오: {pdf_path.name} / {line}")
            year, month, day = map(int, deadline_match.groups())
            deadline = f"{year:04d}-{month:02d}-{day:02d}"
            continue
        if line.startswith("담당 보좌관:") or line == "끝.":
            continue

        item_match = ITEM_RE.match(line)
        if item_match:
            current = {
                "파일명": pdf_path.name,
                "위원회": committee,
                "의원": member,
                "제출기한": deadline,
                "문항번호": int(item_match.group(1)),
                "요구내용": item_match.group(2).strip(),
                "세부항목": "",
                "비고": "",
            }
            items.append(current)
            current_field = "요구내용"
            continue

        if current is None:
            continue

        subitem_match = SUBITEM_RE.match(line)
        if subitem_match:
            current_field = "세부항목"
            text = f"{subitem_match.group(1)}. {subitem_match.group(2).strip()}"
            old_subitems = str(current[current_field]).strip()
            current[current_field] = f"{old_subitems} / {text}" if old_subitems else text
            continue

        note_match = NOTE_RE.match(line)
        if note_match:
            current_field = "비고"
            current[current_field] = join_text(str(current[current_field]), note_match.group(1))
            continue

        current[current_field] = join_text(str(current[current_field]), line)

    if not deadline:
        raise ValueError(f"제출기한을 찾지 못했습니다: {pdf_path.name}")
    if not items:
        raise ValueError(f"문항을 찾지 못했습니다: {pdf_path.name}")
    return items


def verification(pdf_path: Path, items: list[dict[str, str | int]]) -> dict[str, object]:
    expected_match = EXPECTED_RE.search(pdf_path.name)
    expected = int(expected_match.group(1)) if expected_match else None
    numbers = [int(item["문항번호"]) for item in items]
    continuous = numbers == list(range(1, len(numbers) + 1))
    matched = expected == len(items) and continuous and numbers[-1] == expected
    return {
        "파일명": pdf_path.name,
        "파일명의 문항 수": expected,
        "뽑은 문항 수": len(items),
        "마지막 번호": numbers[-1],
        "번호 연속": "O" if continuous else "X",
        "일치": "O" if matched else "X",
    }


def validate_privacy(rows: list[dict[str, str | int]]) -> None:
    combined = "\n".join(str(row[field]) for row in rows for field in FIELDS)
    forbidden = ("담당 보좌관", "연락처", "02-000-0000")
    found = [text for text in forbidden if text in combined]
    if found:
        raise ValueError(f"저장 금지 정보가 결과에 포함되었습니다: {', '.join(found)}")


def main() -> None:
    pdf_paths = sorted(SOURCE_DIR.glob("자료요구서_*.pdf"))
    if len(pdf_paths) != 3:
        raise ValueError(f"PDF 3건을 예상했으나 {len(pdf_paths)}건을 찾았습니다.")

    all_rows: list[dict[str, str | int]] = []
    checks: list[dict[str, object]] = []
    for pdf_path in pdf_paths:
        items = parse_pdf(pdf_path)
        all_rows.extend(items)
        checks.append(verification(pdf_path, items))

    validate_privacy(all_rows)
    if any(check["일치"] == "X" for check in checks):
        raise ValueError(f"문항 수 검증 실패: {checks}")

    with OUTPUT_PATH.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(all_rows)

    print("파일명 | 파일명의 문항 수 | 뽑은 문항 수 | 마지막 번호 | 번호 연속 | 일치(O/X)")
    for check in checks:
        print(
            f'{check["파일명"]} | {check["파일명의 문항 수"]} | '
            f'{check["뽑은 문항 수"]} | {check["마지막 번호"]} | '
            f'{check["번호 연속"]} | {check["일치"]}'
        )

    examples = [row for row in all_rows if row["세부항목"] and row["비고"]][:3]
    print("\n원문 PDF | 문항번호 | 원문에서 추출한 요구내용 | 세부항목 | 비고")
    for row in examples:
        print(
            f'{row["파일명"]} | {row["문항번호"]} | {row["요구내용"]} | '
            f'{row["세부항목"]} | {row["비고"]}'
        )


if __name__ == "__main__":
    main()
