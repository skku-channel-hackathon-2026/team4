import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * 서버가 서명해서 WAM에 넘기는 "이 사람이 이 그룹 채팅에서 앱을 열었다"는 표식.
 * 클라이언트가 돌려주는 방 ID를 그대로 믿지 않기 위한 것이므로,
 * 읽는 쪽은 서명뿐 아니라 채널·호출자 일치와 만료까지 확인해야 한다
 * (`verifyChatTarget` 참고).
 */
const TutorialTargetSchema = z.object({
  channelId: z.string().min(1),
  groupId: z.string().min(1),
  managerId: z.string().min(1),
  expiresAt: z.number().int().positive(),
  /** 방 이름. 화면에 "어느 방에서 온 요청인지" 보여 주는 데만 쓴다. */
  chatTitle: z.string().optional(),
});

const signatureDomain = "channel-app-tutorial-target\0";

export type TutorialTarget = z.infer<typeof TutorialTargetSchema>;

export function createTutorialTargetToken(
  target: TutorialTarget,
  secret: string,
): string {
  const body = Buffer.from(JSON.stringify(target)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(signatureDomain)
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

export function readTutorialTargetToken(
  token: string,
  secret: string,
): TutorialTarget | undefined {
  const parts = token.split(".");
  if (parts.length !== 2) return undefined;

  const [body, signature] = parts;
  if (!body || !signature) return undefined;

  try {
    const expected = createHmac("sha256", secret)
      .update(signatureDomain)
      .update(body)
      .digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return undefined;

    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const result = TutorialTargetSchema.safeParse(parsed);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

/** 토큰이 이 채널·이 호출자의 것이고 아직 살아 있을 때만 대상을 돌려준다. */
export function verifyChatTarget(
  token: string,
  secret: string,
  expected: { channelId: string; managerId: string },
  now = Date.now(),
): TutorialTarget | undefined {
  if (!token) return undefined;
  const target = readTutorialTargetToken(token, secret);
  if (!target) return undefined;
  if (target.channelId !== expected.channelId) return undefined;
  if (target.managerId !== expected.managerId) return undefined;
  if (target.expiresAt <= now) return undefined;
  return target;
}
