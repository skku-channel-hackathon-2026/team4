> 0.2 업데이트: 현재 JSON과 검색 변환 규칙은 [CHANGES_0.2.md](CHANGES_0.2.md)를 먼저 확인하세요. 아래는 초기 설계 배경입니다.

# 맥락형 상황 JSON — 팀 검토 초안

이 작업은 망선박 v2의 자연어 상황 이해를 위한 계약 제안입니다. 앱 실행 코드에 연결하지 않았으며 Q.E.D. 도입 코드는 포함하지 않습니다.

## 코드 카테고리

- [빈 상황 JSON](../code/situation.empty.json)
- [상황 예시](../code/situation.example.json)
- [JSON Schema](../code/situation.schema.json)
- [맥락별 테스트 입력](../code/context-test-cases.json)

## 문서 카테고리

- [설계 설명과 다음 작업](NEXT_STEPS.md)

`code/`는 JSON 데이터 계약·스키마·평가 입력입니다. 모델 호출이나 서버 기능이 구현됐다는 의미가 아닙니다. B 담당과 공유 계약을 합의한 후 Zod 및 대화 분석 함수로 연결합니다. 예시는 모두 가상입니다.
