"""요구 문항을 배분기준표와 대조해 소관 과 후보를 추천한다."""

from __future__ import annotations

import csv
from functools import lru_cache
from pathlib import Path


기준_폴더 = Path(__file__).resolve().parent / "data"
배분기준표 = 기준_폴더 / "배분기준표_소관키워드_304건.csv"
조직도 = 기준_폴더 / "A부_조직도_26개과.csv"
시험자료 = 기준_폴더 / "시험_요구문항_40건.csv"


def _정규화(문자열: str) -> str:
    """대소문자와 앞뒤 공백 차이를 없애 비교한다."""
    return 문자열.strip().casefold()


@lru_cache(maxsize=1)
def _기준_읽기() -> tuple[tuple[dict[str, str], ...], frozenset[str]]:
    """CSV 원본에서 규칙과 허용된 26개 과를 읽는다."""
    with 조직도.open(encoding="utf-8-sig", newline="") as 파일:
        허용과 = frozenset(행["과"].strip() for 행 in csv.DictReader(파일))

    with 배분기준표.open(encoding="utf-8-sig", newline="") as 파일:
        규칙 = tuple(csv.DictReader(파일))

    return 규칙, 허용과


def 소관과_추천(요구문항: str) -> dict[str, object]:
    """소관 과를 추천한다.

    키워드가 포함되고 제외어가 포함되지 않은 규칙만 적용한다.
    우선순위 숫자가 가장 큰 과가 하나면 그 과를 추천한다.
    기준 미일치 또는 서로 다른 과가 최고 우선순위 동률이면
    임의로 확정하지 않고 ``확인필요``를 반환한다.
    """
    if not isinstance(요구문항, str) or not 요구문항.strip():
        raise ValueError("요구문항을 한 글자 이상 입력해 주세요.")

    규칙, 허용과 = _기준_읽기()
    문항 = _정규화(요구문항)
    일치규칙: list[dict[str, object]] = []

    for 규칙행 in 규칙:
        키워드 = _정규화(규칙행["키워드"])
        제외어 = [
            _정규화(값)
            for 값 in 규칙행["제외어"].split("|")
            if 값.strip()
        ]
        if 키워드 and 키워드 in 문항 and not any(값 in 문항 for 값 in 제외어):
            과 = 규칙행["과"].strip()
            if 과 in 허용과:
                일치규칙.append(
                    {
                        "과": 과,
                        "키워드": 규칙행["키워드"].strip(),
                        "우선순위": int(규칙행["우선순위"]),
                    }
                )

    if not 일치규칙:
        return {"소관과": "확인필요", "후보": [], "근거": "일치하는 배분기준 없음"}

    최고순위 = max(int(규칙행["우선순위"]) for 규칙행 in 일치규칙)
    최고규칙 = [규칙행 for 규칙행 in 일치규칙 if 규칙행["우선순위"] == 최고순위]
    후보 = sorted({str(규칙행["과"]) for 규칙행 in 최고규칙})
    근거키워드 = sorted({str(규칙행["키워드"]) for 규칙행 in 최고규칙})

    if len(후보) != 1:
        return {
            "소관과": "확인필요",
            "후보": 후보,
            "근거": f"최고 우선순위 {최고순위} 동률: {', '.join(근거키워드)}",
        }

    return {
        "소관과": 후보[0],
        "후보": 후보,
        "근거": f"우선순위 {최고순위} 키워드: {', '.join(근거키워드)}",
    }


def 시험_실행() -> tuple[int, int]:
    """제공된 시험자료를 채점하고 (정답 수, 전체 수)를 반환한다."""
    with 시험자료.open(encoding="utf-8-sig", newline="") as 파일:
        시험문항 = list(csv.DictReader(파일))

    정답수 = sum(
        소관과_추천(문항["요구내용"])["소관과"] == 문항["정답_배분과"]
        for 문항 in 시험문항
    )
    return 정답수, len(시험문항)


if __name__ == "__main__":
    정답수, 전체수 = 시험_실행()
    print(f"1순위 정답 수: {정답수}/{전체수}")
    print(소관과_추천("최근 3년간 공공데이터 개방 실적"))
