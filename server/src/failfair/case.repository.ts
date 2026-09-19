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
 */
export interface CaseRepository {
  listApproved(category?: Category): Promise<Case[]>;
  list(status?: CaseStatus): Promise<Case[]>;
  get(caseId: string): Promise<Case | undefined>;
  save(item: Case): Promise<Case>;
}

/** 테이블 이전 전에 app_records 한 키에 배열로 있던 사례. 한 번만 옮기고 표식을 남긴다. */
const RECORD_LEGACY_CASES = "failfair:cases";
const RECORD_LEGACY_MIGRATED = "failfair:cases:migrated";

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
/** 이미 있으면 건드리지 않는다. 옛 저장소에서 옮길 때 새 저장소의 변경을 덮지 않으려고. */
const INSERT_IF_ABSENT = `INSERT OR IGNORE INTO failfair_cases ${COLUMNS}`;

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

export class D1CaseRepository implements CaseRepository {
  private backfill: Promise<void> | undefined;

  constructor(private readonly demo: Case[] = DEMO_CASES) {}

  /**
   * 예전 `failfair:cases` 배열을 표로 한 번 옮긴다. 시연용으로 Desk에서 등록해 둔 실제 사례가
   * 배포 뒤 사라지지 않게 하려는 것. INSERT OR IGNORE라 여러 isolate가 겹쳐 돌아도 안전하다.
   * 실패하면 다음 호출이 다시 시도한다.
   */
  private backfillOnce(): Promise<void> {
    this.backfill ??= this.runBackfill().catch((error: unknown) => {
      this.backfill = undefined;
      throw error;
    });
    return this.backfill;
  }

  private async runBackfill(): Promise<void> {
    if (await getRecord<unknown>(RECORD_LEGACY_MIGRATED)) return;
    const legacy = await getRecord<unknown>(RECORD_LEGACY_CASES);
    const items = Array.isArray(legacy) ? legacy.flatMap(parseCase) : [];
    const now = Date.now();
    for (const item of items) await bindCase(INSERT_IF_ABSENT, item, now).run();
    await setRecord(RECORD_LEGACY_MIGRATED, { at: now, count: items.length });
  }

  private async select(where: string, values: string[]): Promise<Case[]> {
    await this.backfillOnce();
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
    await this.backfillOnce();
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
    await this.backfillOnce();
    await bindCase(UPSERT, item, now).run();
    return item;
  }
}

export function newCaseId(now = Date.now()): string {
  const random = Math.random().toString(36).slice(2, 6);
  return `case-${now.toString(36)}-${random}`;
}
