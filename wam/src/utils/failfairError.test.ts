import { describe, expect, it } from 'vitest'

import { resolveError } from './failfairError'

/**
 * 호스트가 거절을 어떤 모양으로 넘기든 같은 코드로 수렴해야 한다.
 * 평범한 `Error`의 message·cause는 열거되지 않는 own property라
 * `Object.values()` 순회만으로는 잡히지 않는다 (PR #7 리뷰 3번).
 */
function errorWithCause(message: string, cause: unknown): Error {
  const error = new Error(message)
  Object.defineProperty(error, 'cause', {
    value: cause,
    enumerable: false,
    configurable: true,
  })
  return error
}

describe('resolveError', () => {
  it('중첩된 data.type에서 찾는다', () => {
    expect(resolveError({ data: { type: 'STALE_SESSION' } }, '기본').code).toBe(
      'STALE_SESSION'
    )
  })

  it('평범한 Error의 message에서 찾는다', () => {
    expect(resolveError(new Error('STALE_SESSION'), '기본').code).toBe(
      'STALE_SESSION'
    )
  })

  it('Error 메시지에 섞여 있어도 찾는다', () => {
    expect(
      resolveError(new Error('call failed: MODEL_UNAVAILABLE (503)'), '기본')
        .code
    ).toBe('MODEL_UNAVAILABLE')
  })

  it('열거되지 않는 Error.cause에서도 찾는다', () => {
    expect(
      resolveError(
        errorWithCause('실패', { type: 'NOT_FOUND_OR_FORBIDDEN' }),
        '기본'
      ).code
    ).toBe('NOT_FOUND_OR_FORBIDDEN')
  })

  it('NOT_FOUND_OR_FORBIDDEN은 재시도가 아니라 재시작을 권한다', () => {
    expect(
      resolveError({ type: 'NOT_FOUND_OR_FORBIDDEN' }, '기본').action
    ).toBe('restart')
  })

  it('알 수 없는 오류는 기본 문구로 떨어진다', () => {
    const resolved = resolveError(new Error('socket hang up'), '기본 문구')
    expect(resolved.code).toBe('UNKNOWN')
    expect(resolved.message).toBe('기본 문구')
  })

  it('한국어 메시지는 그대로 보여 준다', () => {
    expect(
      resolveError(new Error('채널톡 안에서만 열 수 있어요.'), '기본').message
    ).toBe('채널톡 안에서만 열 수 있어요.')
  })
})
