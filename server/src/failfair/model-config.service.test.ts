import assert from "node:assert/strict";
import test from "node:test";
import {
  ModelGatewayResolver,
  type ModelConfigStore,
  type StoredModelConfig,
} from "./model-config.service.js";
import { FallbackGateway, RuleBasedGateway } from "./model-gateway.js";

const memory = (initial?: StoredModelConfig) => {
  let value = initial;
  const store: ModelConfigStore & { reads: number } = {
    reads: 0,
    async load() {
      store.reads += 1;
      return value;
    },
    async save(config) {
      value = config;
    },
  };
  return store;
};

const stored = (
  overrides: Partial<StoredModelConfig> = {},
): StoredModelConfig => ({
  provider: "gemini",
  apiKey: "stored-key",
  model: "gemini-3.1-flash-lite",
  updatedAt: 1000,
  byManagerId: "m1",
  ...overrides,
});

test("환경 변수가 없고 저장값도 없으면 rule", async () => {
  const resolver = new ModelGatewayResolver({}, memory(), () => undefined);
  assert.deepEqual(await resolver.describe(), {
    provider: "rule",
    source: "none",
  });
  assert.ok((await resolver.resolve()) instanceof RuleBasedGateway);
});

test("Desk에서 저장한 값으로 Gemini가 켜지고, 끄면 rule로 돌아간다", async () => {
  const resolver = new ModelGatewayResolver({}, memory(), () => undefined);
  await resolver.save(stored());
  const status = await resolver.describe();
  assert.equal(status.provider, "gemini");
  assert.equal(status.source, "record");
  assert.equal(status.model, "gemini-3.1-flash-lite");
  assert.ok(!JSON.stringify(status).includes("stored-key"));
  const first = await resolver.resolve();
  assert.ok(first instanceof FallbackGateway);
  assert.equal(await resolver.resolve(), first, "같은 설정이면 재사용");
  await resolver.save(
    stored({ provider: "rule", apiKey: "", updatedAt: 2000 }),
  );
  assert.equal((await resolver.describe()).provider, "rule");
  assert.ok((await resolver.resolve()) instanceof RuleBasedGateway);
});

test("환경 변수가 있으면 저장값보다 우선하고 저장소를 읽지 않는다", async () => {
  const store = memory(stored());
  const resolver = new ModelGatewayResolver(
    { MODEL_PROVIDER: "rule" },
    store,
    () => undefined,
  );
  assert.deepEqual(await resolver.describe(), {
    provider: "rule",
    source: "env",
  });
  assert.equal(store.reads, 0);
});

test("저장소 조회가 실패해도(DB 없음) rule로 기동한다", async () => {
  const broken: ModelConfigStore = {
    load: async () => {
      throw new Error("D1 requires the Cloudflare runtime");
    },
    save: async () => undefined,
  };
  const resolver = new ModelGatewayResolver({}, broken, () => undefined);
  assert.deepEqual(await resolver.describe(), {
    provider: "rule",
    source: "none",
  });
  assert.ok((await resolver.resolve()) instanceof RuleBasedGateway);
});
