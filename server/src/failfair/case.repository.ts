import {
  CaseSchema,
  DEMO_CASES,
  type Case,
  type CaseStatus,
  type Category,
} from "@tutorial/shared";
import { getDatabase, resultRows } from "../database.js";
import { getRecord, setRecord } from "../records.js";

/**
 * 사례 저장소 계약. B가 소유한다.
 * 저장은 D1 `failfair_cases` 한 행 = 사례 하나. 번들의 가상 사례(DEMO_CASES)는 DB에 넣지 않고
 * 읽을 때 합치며, 같은 id의 행이 DB에 있으면 그쪽이 이긴다 (가상 사례를 숨길 때 그렇게 된다).
 *
 * 저장할 때 옛 `failfair:cases` 배열에도 같은 사례를 남긴다 (거울). 코드를 되돌리면 옛 코드는
 * 그 배열만 읽으므로, 거울이 없으면 숨긴 사례가 다시 보이고 새로 등록한 사례가 사라진 것처럼 보인다.
 * 표가 정답이고 거울은 롤백 대비용이다. 배열 갱신은 읽고-쓰기라 동시 저장 때 한 건이 빠질 수 있지만,
 * 다음 배포에서 표를 기준으로 다시 맞춘다 (legacy-import.ts).
 */
export interface CaseRepository {
  listApproved(category?: Category): Promise<Case[]>;
  list(status?: CaseStatus): Promise<Case[]>;
  get(caseId: string): Promise<Case | undefined>;
  save(item: Case): Promise<Case>;
}

/** 옛 코드가 읽는 사례 배열. 롤백 대비 거울로 계속 갱신한다. */
export const RECORD_LEGACY_CASES = "failfair:cases";

function parseCase(candidate: unknown): Case[] {
  const parsed = CaseSchema.safeParse(candidate);
  return parsed.success ? [parsed.data] : [];
}

function parseRow(row: { body_json: string }): Case[] {
  try {
    return parseCase(JSON.parse(row.body_json));
  } catch {
    return [];
  }
}

const COLUMNS =
  "(id, category, status, source_type, author_manager_id, allow_contact, version, body_json, created_at, updated_at) " +
  "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
const UPSERT =
  `INSERT INTO failfair_cases ${COLUMNS} ` +
  "ON CONFLICT(id) DO UPDATE SET category = excluded.category, status = excluded.status, " +
  "source_type = excluded.source_type, author_manager_id = excluded.author_manager_id, " +
  "allow_contact = excluded.allow_contact, version = excluded.version, " +
  "body_json = excluded.body_json, updated_at = excluded.updated_at";
/** 옛 저장소에서 옮길 때: 표에 더 새 버전이 있으면 건드리지 않는다. */
const UPSERT_IF_NEWER =
  `INSERT INTO failfair_cases ${COLUMNS} ` +
  "ON CONFLICT(id) DO UPDATE SET category = excluded.category, status = excluded.status, " +
  "source_type = excluded.source_type, author_manager_id = excluded.author_manager_id, " +
  "allow_contact = excluded.allow_contact, version = excluded.version, " +
  "body_json = excluded.body_json, updated_at = excluded.updated_at " +
  "WHERE excluded.version > failfair_cases.version";

function bindCase(sql: string, item: Case, now: number) {
  return getDatabase()
    .prepare(sql)
    .bind(
      item.id,
      item.category,
      item.status,
      item.sourceType,
      item.authorManagerId ?? null,
      item.allowContact ? 1 : 0,
      item.version,
      JSON.stringify(item),
      item.createdAt,
      now,
    );
}

export function bindCaseUpsertIfNewer(item: Case, now: number) {
  return bindCase(UPSERT_IF_NEWER, item, now);
}

/** 옛 배열에 같은 id가 있으면 바꾸고 없으면 붙인다. 표를 쓴 뒤에 부른다. */
async function mirrorToLegacy(item: Case): Promise<void> {
  const stored = await getRecord<unknown>(RECORD_LEGACY_CASES);
  const others = (Array.isArray(stored) ? stored : []).filter(
    (candidate) => (candidate as { id?: string })?.id !== item.id,
  );
  await setRecord(RECORD_LEGACY_CASES, [...others, item]);
}

export class D1CaseRepository implements CaseRepository {
  constructor(private readonly demo: Case[] = DEMO_CASES) {}

  private async select(where: string, values: string[]): Promise<Case[]> {
    const result = await getDatabase()
      .prepare(
        `SELECT body_json FROM failfair_cases ${where} ORDER BY created_at, id`,
      )
      .bind(...values)
      .all<{ body_json: string }>();
    return resultRows<{ body_json: string }>(result).flatMap(parseRow);
  }

  /** DB에 같은 id가 있는 가상 사례는 번들 쪽을 숨긴다. */
  private async overriddenIds(): Promise<Set<string>> {
    const result = await getDatabase()
      .prepare("SELECT id FROM failfair_cases")
      .all<{ id: string }>();
    return new Set(resultRows<{ id: string }>(result).map((row) => row.id));
  }

  private async merge(
    keep: (item: Case) => boolean,
    where: string,
    values: string[],
  ): Promise<Case[]> {
    const [overridden, stored] = await Promise.all([
      this.overriddenIds(),
      this.select(where, values),
    ]);
    const demo = this.demo.filter(
      (item) => !overridden.has(item.id) && keep(item),
    );
    return [...demo, ...stored];
  }

  async listApproved(category?: Category): Promise<Case[]> {
    return this.merge(
      (item) =>
        item.status === "approved" &&
        (category === undefined || item.category === category),
      category === undefined
        ? "WHERE status = 'approved'"
        : "WHERE status = 'approved' AND category = ?",
      category === undefined ? [] : [category],
    );
  }

  async list(status?: CaseStatus): Promise<Case[]> {
    return this.merge(
      (item) => status === undefined || item.status === status,
      status === undefined ? "" : "WHERE status = ?",
      status === undefined ? [] : [status],
    );
  }

  async get(caseId: string): Promise<Case | undefined> {
    const [stored] = await this.select("WHERE id = ?", [caseId]);
    return stored ?? this.demo.find((item) => item.id === caseId);
  }

  async save(item: Case, now = Date.now()): Promise<Case> {
    await bindCase(UPSERT, item, now).run();
    await mirrorToLegacy(item);
    return item;
  }
}

export function newCaseId(now = Date.now()): string {
  const random = Math.random().toString(36).slice(2, 6);
  return `case-${now.toString(36)}-${random}`;
}
