import { useMemo } from 'react'
import { useTypedWamData, useWamData } from '@channel.io/app-sdk-wam'
import { FailfairWamDataSchema, type FailfairWamData } from '@tutorial/shared'

export interface FailfairWamDataResult {
  data: FailfairWamData | null
  error: string | null
}

/** 호스트가 넣어 준 값과 서버가 보낸 wamArgs를 한 번에 검증한다. */
export function useFailfairWamData(): FailfairWamDataResult {
  const appId = useTypedWamData('appId')
  const channelId = useTypedWamData('channelId')
  const managerId = useTypedWamData('managerId')
  const chatId = useTypedWamData('chatId')
  const chatType = useTypedWamData('chatType')
  const chatTitle = useTypedWamData('chatTitle')
  const mode = useWamData('mode')

  return useMemo(() => {
    const parsed = FailfairWamDataSchema.safeParse({
      appId,
      channelId,
      managerId,
      chatId,
      chatType,
      chatTitle,
      mode: typeof mode === 'string' && mode ? mode : undefined,
    })
    if (parsed.success) return { data: parsed.data, error: null }
    return {
      data: null,
      error:
        '채널톡이 넘겨준 값이 비어 있어요. 채팅창에서 /tutorial 또는 /망선박 을 다시 실행해 주세요.',
    }
  }, [appId, channelId, chatId, chatTitle, chatType, managerId, mode])
}
