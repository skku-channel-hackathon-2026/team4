import { WamProvider } from '@channel.io/app-sdk-wam'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import App from './App'
import { installFakeBridge, type FakeBridge } from './test/fakeBridge'

let bridge: FakeBridge

/** 홈 → 카테고리 → 대화까지 들어간다. */
async function openChat() {
  render(
    <WamProvider>
      <App />
    </WamProvider>
  )
  fireEvent.click(screen.getByText(/학생이에요/))
  fireEvent.click(screen.getByText('팀플·과제'))
  await screen.findByPlaceholderText(/상황을 편하게/)
}

function send(text: string) {
  fireEvent.change(screen.getByPlaceholderText(/상황을 편하게/), {
    target: { value: text },
  })
  fireEvent.click(screen.getByRole('button', { name: '보내기' }))
}

beforeEach(() => {
  bridge = installFakeBridge()
})

afterEach(cleanup)

describe('재시도 복구 (PR #7 리뷰 1번)', () => {
  it('STALE_SESSION이면 학생 말풍선을 보존하고 최신 revision으로 복구한다', async () => {
    await openChat()
    // 서버는 이미 revision 7까지 가 있고, 화면은 0을 들고 있는 상황
    bridge.forceRevision(7)
    bridge.failReplyWith(new Error('STALE_SESSION'))

    send('팀원이 잠수탔어요')
    await screen.findByText(/그 사이에 대화 내용이 바뀌었어요/)

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(bridge.replies()).toHaveLength(2))

    const [first, second] = bridge.replies()
    expect(first.expectedRevision).toBe(0)
    // 낡은 0이 아니라 최신화된 7로 나가야 한다
    expect(second.expectedRevision).toBe(7)
    await waitFor(() => {
      expect(screen.getAllByText('팀원이 잠수탔어요')).toHaveLength(1)
      expect(screen.queryByText('보내지 못했어요')).toBeNull()
    })
    expect(
      bridge
        .session()
        .messages.filter(
          (message) =>
            message.role === 'student' &&
            message.content === '팀원이 잠수탔어요'
        )
    ).toHaveLength(1)
    expect(bridge.session().revision).toBe(8)

    send('8시간 남았어요')
    await waitFor(() => expect(bridge.replies()).toHaveLength(3))
    expect(bridge.replies()[2].expectedRevision).toBe(8)
    expect(bridge.session().revision).toBe(9)
  })

  it('재시도는 같은 requestId를 유지한다', async () => {
    await openChat()
    bridge.failReplyWith(new Error('MODEL_UNAVAILABLE'))

    send('팀원이 잠수탔어요')
    await screen.findByText(/지금은 답을 만들지 못했어요/)

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(bridge.replies()).toHaveLength(2))

    const [first, second] = bridge.replies()
    // 서버가 이미 처리했을 수 있으므로 중복 실행되지 않아야 한다
    expect(second.requestId).toBe(first.requestId)
  })

  it('저장 후 응답만 유실돼도 서버와 화면에 메시지를 한 번만 남긴다', async () => {
    await openChat()
    bridge.loseReplyAfterCommit()

    send('팀원이 잠수탔어요')
    await screen.findByText(/메시지를 보내지 못했어요/)

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(bridge.replies()).toHaveLength(2))

    const [first, second] = bridge.replies()
    expect(second.requestId).toBe(first.requestId)
    expect(bridge.session().revision).toBe(1)
    expect(
      bridge
        .session()
        .messages.filter(
          (message) =>
            message.role === 'student' &&
            message.content === '팀원이 잠수탔어요'
        )
    ).toHaveLength(1)
    await waitFor(() => {
      expect(screen.getAllByText('팀원이 잠수탔어요')).toHaveLength(1)
      expect(screen.getAllByText('언제까지 해결해야 하나요?')).toHaveLength(1)
      expect(screen.queryByText('보내지 못했어요')).toBeNull()
    })
  })

  it('말풍선의 다시 보내기도 같은 requestId를 쓴다', async () => {
    await openChat()
    bridge.failReplyWith(new Error('MODEL_UNAVAILABLE'))

    send('팀원이 잠수탔어요')
    await screen.findByText('보내지 못했어요')

    fireEvent.click(screen.getByRole('button', { name: '다시 보내기' }))
    await waitFor(() => expect(bridge.replies()).toHaveLength(2))

    const [first, second] = bridge.replies()
    expect(second.requestId).toBe(first.requestId)
  })
})

describe('보내지 못한 메시지 (PR #7 리뷰 2번)', () => {
  it('뒤 메시지가 성공해도 앞의 실패 표시가 남는다', async () => {
    await openChat()
    bridge.failReplyWith(new Error('MODEL_UNAVAILABLE'))

    send('팀원이 잠수탔어요')
    await screen.findByText('보내지 못했어요')

    // 다음 메시지는 정상 전송된다
    send('8시간 남았어요')
    await waitFor(() => expect(bridge.replies()).toHaveLength(2))

    // 앞 메시지의 실패 표시와 안내가 그대로 있어야 한다
    expect(screen.getByText('보내지 못했어요')).toBeTruthy()
    expect(screen.getByText(/아직 보내지 못한 말이 1개 있어요/)).toBeTruthy()
  })

  it('다시 보내기가 성공하면 실패 표시가 사라지고 말풍선이 중복되지 않는다', async () => {
    await openChat()
    bridge.failReplyWith(new Error('MODEL_UNAVAILABLE'))

    send('팀원이 잠수탔어요')
    await screen.findByText('보내지 못했어요')

    fireEvent.click(screen.getByRole('button', { name: '다시 보내기' }))
    await waitFor(() =>
      expect(screen.queryByText('보내지 못했어요')).toBeNull()
    )

    expect(screen.getAllByText('팀원이 잠수탔어요')).toHaveLength(1)
  })
})
