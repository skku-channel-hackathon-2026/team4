/**
 * 성균관대학교 학부 전공 목록.
 *
 * 사례 검색에 학과별 학사 규정 차이를 반영하기 위한 참고 데이터다(v2 §13 "수업·학사
 * 규정 차이를 사례 조건에 기록"). 화면에서는 단과대학을 고른 뒤 학과를 고르는
 * 2단계 선택으로 쓴다.
 *
 * 출처는 공개 위키 정리본이며 학사 공지 원문으로 검증한 목록이 아니다. 학과 개편이
 * 잦으므로 시연 전에 학부대학 학과안내와 한 번 대조할 것. 값은 화면 표시용 문자열
 * 그대로 저장하며, 서버는 이 목록으로 입력을 거절하지 않는다(목록에 없는 학과가
 * 있어도 학생이 막히지 않게).
 */

export type CampusId = "humanities" | "science" | "both";

export const CAMPUS_LABELS: Record<CampusId, string> = {
  humanities: "인문사회과학캠퍼스",
  science: "자연과학캠퍼스",
  both: "공통",
};

export interface College {
  /** 저장·비교에 쓰는 안정된 키. 한 번 정하면 바꾸지 않는다. */
  id: string;
  name: string;
  campus: CampusId;
  departments: readonly string[];
}

export const SKKU_COLLEGES: readonly College[] = [
  {
    id: "hakbu",
    name: "학부대학 (계열)",
    campus: "both",
    departments: [
      "인문과학계열",
      "사회과학계열",
      "자연과학계열",
      "공학계열",
      "아직 학과를 정하지 않았어요",
    ],
  },
  {
    id: "software",
    name: "소프트웨어융합대학",
    campus: "both",
    departments: ["소프트웨어학과", "글로벌융합학부", "지능형소프트웨어학과"],
  },
  {
    id: "convergence",
    name: "성균융합원",
    campus: "both",
    departments: [
      "글로벌바이오메디컬공학과",
      "응용AI융합학부",
      "에너지학과",
      "배터리학과",
    ],
  },
  {
    id: "confucian",
    name: "유학대학",
    campus: "humanities",
    departments: ["유학·동양학과"],
  },
  {
    id: "liberal_arts",
    name: "문과대학",
    campus: "humanities",
    departments: [
      "국어국문학과",
      "영어영문학과",
      "프랑스어문학과",
      "중어중문학과",
      "독어독문학과",
      "러시아어문학과",
      "한문학과",
      "사학과",
      "철학과",
      "문헌정보학과",
    ],
  },
  {
    id: "social_science",
    name: "사회과학대학",
    campus: "humanities",
    departments: [
      "행정학과",
      "정치외교학과",
      "미디어커뮤니케이션학과",
      "사회학과",
      "사회복지학과",
      "심리학과",
      "소비자학과",
      "아동·청소년학과",
      "글로벌리더학부",
    ],
  },
  {
    id: "economics",
    name: "경제대학",
    campus: "humanities",
    departments: ["경제학과", "통계학과", "글로벌경제학과"],
  },
  {
    id: "business",
    name: "경영대학",
    campus: "humanities",
    departments: ["경영학과", "글로벌경영학과"],
  },
  {
    id: "education",
    name: "사범대학",
    campus: "humanities",
    departments: ["교육학과", "한문교육과", "수학교육과", "컴퓨터교육과"],
  },
  {
    id: "arts",
    name: "예술대학",
    campus: "humanities",
    departments: [
      "미술학과",
      "디자인학과",
      "무용학과",
      "영상학과",
      "연기예술학과",
      "의상학과",
    ],
  },
  {
    id: "natural_science",
    name: "자연과학대학",
    campus: "science",
    departments: ["생명과학과", "수학과", "물리학과", "화학과"],
  },
  {
    id: "ict",
    name: "정보통신대학",
    campus: "science",
    departments: [
      "전자전기공학부",
      "반도체시스템공학과",
      "소재부품융합공학과",
      "반도체융합공학과",
    ],
  },
  {
    id: "engineering",
    name: "공과대학",
    campus: "science",
    departments: [
      "화학공학·고분자공학부",
      "신소재공학부",
      "기계공학부",
      "건설환경공학부",
      "시스템경영공학과",
      "나노공학과",
      "건축학과",
    ],
  },
  {
    id: "bio",
    name: "생명공학대학",
    campus: "science",
    departments: ["식품생명공학과", "바이오메카트로닉스학과", "융합생명공학과"],
  },
  {
    id: "pharmacy",
    name: "약학대학",
    campus: "science",
    departments: ["약학과"],
  },
  {
    id: "sports",
    name: "스포츠과학대학",
    campus: "science",
    departments: ["스포츠과학과"],
  },
  {
    id: "medicine",
    name: "의과대학",
    campus: "science",
    departments: ["의예과", "의학과"],
  },
];

export function findCollege(id: string): College | undefined {
  return SKKU_COLLEGES.find((college) => college.id === id);
}

/** 화면과 사례 조건에 한 줄로 쓰는 표기. 예: "공과대학 · 기계공학부" */
export function majorLabel(major?: {
  collegeId: string;
  department?: string;
}): string {
  if (!major) return "";
  const college = findCollege(major.collegeId);
  const name = college?.name ?? major.collegeId;
  return major.department ? `${name} · ${major.department}` : name;
}
