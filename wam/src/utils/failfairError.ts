import { FAILFAIR_ERRORS } from '@tutorial/shared'

/**
 * 서버가 내려 주는 오류 코드를 화면이 쓸 수 있는 문구·행동으로 바꾼다. A가 소유한다.
 *
 * 호스트(채널톡)가 `callFunction` 거절을 어떤 모양으로 넘겨줄지는 SDK 타입에
 * 정의돼 있지 않다. 그래서 코드를 한 곳에서만 찾지 않고, 흔한 위치(`type`,
 * `data.type`, `error.type`)와 `Error`의 `message`·`name`·`cause`까지 훑어서
 * 판별한다. 어느 쪽으로 오더라도 v2 §10의 다섯 코드는 같은 안내로 수렴한다.
 */

export type FailfairErrorCode =
  (typeof FAILFAIR_ERRORS)[keyof typeof FAILFAIR_ERRORS]

/** 배너가 함께 보여 줄 행동. `retry`는 실패한 호출을 그대로 다시 부른다. */
export type FailfairErrorAction = 'retry' | 'restart' | 'none'

export interface FailfairError {
  code: FailfairErrorCode | 'UNKNOWN'
  /** 사용자에게 보여 줄 한 줄 */
  message: string
  /** 무엇을 하면 되는지 */
  hint?: string
  action: FailfairErrorAction
}

const CODES = Object.values(FAILFAIR_ERRORS) as FailfairErrorCode[]

const COPY: Record<
  FailfairErrorCode,
  { message: string; hint?: string; action: FailfairErrorAction }
> = {
  INVALID_INPUT: {
    message: '입력한 내용을 그대로 보낼 수 없었어요.',
    hint: '내용을 조금 고쳐서 다시 보내 주세요.',
    action: 'none',
  },
  NOT_FOUND_OR_FORBIDDEN: {
    message: '이 대화를 열 수 없어요.',
    hint: '다른 계정에서 만든 대화이거나 이미 사라진 대화예요. 처음부터 다시 시작해 주세요.',
    action: 'restart',
  },
  STALE_SESSION: {
    message: '그 사이에 대화 내용이 바뀌었어요.',
    hint: '가장 최근 상태로 맞춰 뒀어요. 방금 하려던 걸 한 번 더 해 주세요.',
    action: 'retry',
  },
  MODEL_UNAVAILABLE: {
    message: '지금은 답을 만들지 못했어요.',
    hint: '잠시 뒤 다시 시도하면 대부분 됩니다. 지금까지 적은 내용은 그대로 남아 있어요.',
    action: 'retry',
  },
  IN_PROGRESS: {
    message: '앞선 요청을 아직 처리하고 있어요.',
    hint: '몇 초 뒤에 다시 시도해 주세요.',
    action: 'retry',
  },
  CHAT_TARGET_REQUIRED: {
    message: '여기서는 SOS를 보낼 수 없어요.',
    hint: '채팅창에서 /망선박을 다시 열어 주세요.',
    action: 'none',
  },
  NO_SENIOR_AVAILABLE: {
    message: '아직 연락을 허용한 선배가 없어요.',
    hint: '이 고민 분야에 실제 경험을 남기고 SOS를 허용한 선배가 등록되면 바로 보낼 수 있어요.',
    action: 'none',
  },
}

/** 객체 안을 얕게 돌면서 알려진 오류 코드를 찾는다. */
function findCode(value: unknown, depth = 0): FailfairErrorCode | null {
  if (depth > 4 || value == null) return null

  if (typeof value === 'string') {
    return CODES.find((code) => value.includes(code)) ?? null
  }
  if (typeof value !== 'object') return null

  // `Error`의 message·name·cause는 열거 가능한 속성이 아니라 아래 Object.values
  // 순회에 잡히지 않는다. 호스트가 평범한 Error로 거절하면 코드를 통째로
  // 놓치므로 여기서 따로 본다.
  if (value instanceof Error) {
    const own =
      findCode(value.message, depth + 1) ??
      findCode(value.name, depth + 1) ??
      // `cause`는 tsconfig lib(ES2020)에 없지만 런타임에는 있을 수 있다.
      findCode((value as { cause?: unknown }).cause, depth + 1)
    if (own) return own
  }

  for (const nested of Object.values(value as Record<string, unknown>)) {
    const found = findCode(nested, depth + 1)
    if (found) return found
  }
  return null
}

/** 사람이 읽을 만한 문장만 골라 낸다. 영문 스택이나 빈 문자열은 버린다. */
function readableMessage(cause: unknown): string | null {
  const raw =
    cause instanceof Error
      ? cause.message
      : typeof cause === 'string'
        ? cause
        : null
  if (!raw) return null
  const text = raw.trim()
  if (!text) return null
  // 서버 내부 메시지는 영어라 사용자에게 그대로 보여 주지 않는다.
  return /[가-힣]/.test(text) ? text : null
}

export function resolveError(cause: unknown, fallback: string): FailfairError {
  const code = findCode(cause)
  if (code) {
    const copy = COPY[code]
    return { code, ...copy }
  }
  return {
    code: 'UNKNOWN',
    message: readableMessage(cause) ?? fallback,
    hint: '같은 문제가 이어지면 처음부터 다시 시작해 보세요.',
    action: 'retry',
  }
}

/** 사용자가 되돌릴 수 없는 오류인지. 이 경우 화면을 유지하고 안내만 한다. */
export function isFatal(error: FailfairError): boolean {
  return error.action === 'restart'
}
