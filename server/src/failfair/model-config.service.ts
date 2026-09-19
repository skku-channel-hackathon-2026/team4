import { z } from "zod";
import { getRecord, setRecord } from "../records.js";
import {
  createModelGateway,
  describeModelConfig,
  type ModelConfig,
  type ModelGateway,
} from "./model-gateway.js";

/**
 * 런타임 모델 설정. B가 소유한다.
 *
 * 환경 변수(운영진 비밀 변수)가 있으면 그것이 항상 우선이다. 없을 때는 Desk의 "모델 설정" 화면에서
 * 매니저가 저장한 값(app_records `failfair:model`)을 쓴다. 운영진 배포 파이프라인이 레포 설정값을
 * 실서버에 넘기지 않는 상황(2026-09-19)에서 운영진 없이 Gemini를 켜고 끄기 위한 경로다.
 * 값은 서버 밖으로 돌려주지 않는다 (getModel은 provider·model·source만).
 */
export const RECORD_MODEL = "failfair:model";

export const StoredModelConfigSchema = z.object({
  provider: z.enum(["gemini", "rule"]),
  apiKey: z.string().default(""),
  model: z.string().default("gemini-3.1-flash-lite"),
  updatedAt: z.number(),
  byManagerId: z.string().default(""),
});
export type StoredModelConfig = z.infer<typeof StoredModelConfigSchema>;

export interface ModelConfigStore {
  load(): Promise<StoredModelConfig | undefined>;
  save(config: StoredModelConfig): Promise<void>;
}

export const appRecordsModelConfigStore: ModelConfigStore = {
  async load() {
    const parsed = StoredModelConfigSchema.safeParse(
      await getRecord<unknown>(RECORD_MODEL),
    );
    return parsed.success ? parsed.data : undefined;
  },
  async save(config) {
    await setRecord(RECORD_MODEL, config);
  },
};

export type ModelSource = "env" | "record" | "none";
export interface ResolvedModelConfig extends ModelConfig {
  source: ModelSource;
}

export class ModelGatewayResolver {
  private cached: { signature: string; gateway: ModelGateway } | undefined;

  constructor(
    private readonly env: Record<string, string | undefined> = process.env,
    private readonly store: ModelConfigStore = appRecordsModelConfigStore,
    private readonly log: (message: string) => void = (message) =>
      console.warn(message),
  ) {}

  /** 지금 무엇이 기동되는지. 저장소 조회 실패(DB 없음 등)는 rule로 취급한다. */
  async describe(): Promise<ResolvedModelConfig> {
    const envConfig = describeModelConfig(this.env);
    if (this.env.MODEL_PROVIDER?.trim()) return { ...envConfig, source: "env" };
    const stored = await this.loadStored();
    if (stored?.provider === "gemini" && stored.apiKey.trim()) {
      return {
        ...describeModelConfig(this.envFrom(stored)),
        source: "record",
      };
    }
    return { provider: "rule", source: "none" };
  }

  /** 요청마다 부른다. 같은 설정이면 게이트웨이 인스턴스를 재사용한다. */
  async resolve(): Promise<ModelGateway> {
    let env = this.env;
    let signature = "env";
    if (!this.env.MODEL_PROVIDER?.trim()) {
      const stored = await this.loadStored();
      if (stored?.provider === "gemini" && stored.apiKey.trim()) {
        env = this.envFrom(stored);
        signature = `record:${stored.updatedAt}`;
      } else {
        signature = "rule";
      }
    }
    if (this.cached?.signature !== signature) {
      this.cached = {
        signature,
        gateway: createModelGateway(env, this.log),
      };
    }
    return this.cached.gateway;
  }

  async save(config: StoredModelConfig): Promise<void> {
    await this.store.save(config);
    this.cached = undefined;
  }

  private async loadStored(): Promise<StoredModelConfig | undefined> {
    try {
      return await this.store.load();
    } catch {
      return undefined;
    }
  }

  private envFrom(
    stored: StoredModelConfig,
  ): Record<string, string | undefined> {
    return {
      ...this.env,
      MODEL_PROVIDER: "gemini",
      GEMINI_API_KEY: stored.apiKey,
      GEMINI_MODEL: stored.model,
    };
  }
}
