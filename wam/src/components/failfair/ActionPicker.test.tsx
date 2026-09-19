import { WamThemeProvider } from '@channel.io/app-sdk-wam-ui'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ActionPicker from './ActionPicker'

afterEach(cleanup)
it('부정 표현을 키워드로 자동 분류하지 않고 의미 확인 후 비교한다', () => {
  const onCompare = vi.fn()
  render(
    <WamThemeProvider>
      <ActionPicker
        category="team_project"
        actions={[]}
        busy={false}
        revisiting={false}
        onCompare={onCompare}
      />
    </WamThemeProvider>
  )
  fireEvent.click(
    screen.getByRole('button', { name: '다른 것도 생각하고 있어요' })
  )
  fireEvent.change(screen.getByPlaceholderText('예: 팀원 재배정 요청'), {
    target: { value: '교수님께 알리지 않고 기다리기' },
  })
  fireEvent.click(screen.getByRole('button', { name: '추가' }))
  const compare = screen.getByRole('button', {
    name: '선배 사례 비교하기 (1)',
  }) as HTMLButtonElement
  expect(compare.disabled).toBe(true)
  fireEvent.click(
    screen.getByRole('button', { name: '어느 것도 아니에요 · 미지원으로 진행' })
  )
  expect(compare.disabled).toBe(false)
  fireEvent.click(compare)
  expect(onCompare.mock.calls[0][0][0].actionTag).toBeUndefined()
})
