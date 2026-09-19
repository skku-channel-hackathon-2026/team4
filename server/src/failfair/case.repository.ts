import {
  CaseSchema,
  DEMO_CASES,
  type Case,
  type CaseStatus,
  type Category,
} from "@tutorial/shared";
import { getRecord, setRecord } from "../records.js";

/**
 * 사례 저장소 계약. B가 소유한다.
 * 지금은 기존 `app_records` 테이블에 JSON으로 저장한다. `0002_failfair.sql`의
 * `failfair_cases` 테이블로 옮길 때 이 인터페이스만 지키면 나머지 코드는 그대로다.
 */
export interface CaseRepository {
  listApproved(category?: Category): Promise<Case[]>;
  list(status?: CaseStatus): Promise<Case[]>;
  get(caseId: string): Promise<Case | undefined>;
  save(item: Case): Promise<Case>;
}

const RECORD_CASES = "failfair:cases";

function parseAll(raw: unknown): Case[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((candidate) => {
    const parsed = CaseSchema.safeParse(candidate);
    return parsed.success ? [parsed.data] : [];
  });
}

export class AppRecordsCaseRepository implements CaseRepository {
  constructor(private readonly demo: Case[] = DEMO_CASES) {}

  private async stored(): Promise<Case[]> {
    return parseAll(await getRecord<unknown>(RECORD_CASES));
  }

  private async all(): Promise<Case[]> {
    const stored = await this.stored();
    const storedIds = new Set(stored.map((item) => item.id));
    return [...this.demo.filter((item) => !storedIds.has(item.id)), ...stored];
  }

  async listApproved(category?: Category): Promise<Case[]> {
    return (await this.all()).filter(
      (item) =>
        item.status === "approved" &&
        (category === undefined || item.category === category),
    );
  }

  async list(status?: CaseStatus): Promise<Case[]> {
    return (await this.all()).filter(
      (item) => status === undefined || item.status === status,
    );
  }

  async get(caseId: string): Promise<Case | undefined> {
    return (await this.all()).find((item) => item.id === caseId);
  }

  async save(item: Case): Promise<Case> {
    const stored = await this.stored();
    const next = [
      ...stored.filter((existing) => existing.id !== item.id),
      item,
    ];
    await setRecord(RECORD_CASES, next);
    return item;
  }
}

export function newCaseId(now = Date.now()): string {
  const random = Math.random().toString(36).slice(2, 6);
  return `case-${now.toString(36)}-${random}`;
}
