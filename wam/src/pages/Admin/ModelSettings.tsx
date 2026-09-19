import { useCallback, useEffect, useState } from 'react'
import {
  Badge,
  Button,
  HStack,
  Text,
  TextInput,
  VStack,
} from '@channel.io/bezier-react/beta'
import { InlineBanner, LoadingPage } from '@channel.io/app-sdk-wam-ui'
import type { ModelStatus } from '@tutorial/shared'

import Section from '../../components/failfair/Section'
import { errorMessage } from '../../hooks/useFailfairApi'

interface ModelSettingsPageProps {
  getModel: () => Promise<ModelStatus>
  setModel: (input: {
    provider: 'gemini' | 'rule'
    apiKey?: string
    model?: string
  }) => Promise<ModelStatus>
}

const SOURCE_LABEL: Record<ModelStatus['source'], string> = {
  env: '운영진 비밀 변수',
  record: 'Desk에서 저장한 값',
  none: '설정 없음',
}

/**
 * 운영진 없이 Gemini를 켜고 끄는 화면. 키는 서버에만 저장되고 다시 보여 주지 않는다.
 * 운영진 비밀 변수가 있으면 여기서 바꿔도 그쪽이 우선이다.
 */
function ModelSettingsPage({ getModel, setModel }: ModelSettingsPageProps) {
  const [status, setStatus] = useState<ModelStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [model, setModelName] = useState('gemini-3.1-flash-lite')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    getModel()
      .then((result) => {
        setStatus(result)
        if (result.model) setModelName(result.model)
      })
      .catch((cause: unknown) =>
        setError(errorMessage(cause, '모델 상태를 불러오지 못했어요.'))
      )
  }, [getModel])

  useEffect(() => {
    load()
  }, [load])

  const apply = async (provider: 'gemini' | 'rule') => {
    setBusy(true)
    setError(null)
    try {
      const result = await setModel(
        provider === 'gemini'
          ? { provider, apiKey: apiKey.trim(), model: model.trim() }
          : { provider }
      )
      setStatus(result)
      setApiKey('')
    } catch (cause) {
      setError(errorMessage(cause, '설정을 저장하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  if (status === null && !error)
    return <LoadingPage message="모델 상태를 불러오는 중" />

  return (
    <VStack spacing={16}>
      {error && (
        <InlineBanner
          variant="error"
          content={error}
        />
      )}
      {status && (
        <Section title="지금 상태">
          <div className="ff-box">
            <VStack spacing={6}>
              <HStack
                spacing={6}
                wrap
              >
                <Badge
                  size="xs"
                  variant={status.provider === 'gemini' ? 'green' : 'default'}
                >
                  {status.provider === 'gemini'
                    ? 'Gemini 사용 중'
                    : '규칙 기반'}
                </Badge>
                <Badge
                  size="xs"
                  variant="default"
                >
                  {SOURCE_LABEL[status.source]}
                </Badge>
                {status.model && (
                  <Badge
                    size="xs"
                    variant="default"
                  >
                    {status.model}
                  </Badge>
                )}
              </HStack>
              {status.warning && (
                <Text
                  as="p"
                  typo="13"
                  color="text-neutral-light"
                >
                  {status.warning}
                </Text>
              )}
              {status.source === 'env' && (
                <Text
                  as="p"
                  typo="13"
                  color="text-neutral-light"
                >
                  운영진 비밀 변수가 우선이라 여기서 바꿔도 적용되지 않아요.
                </Text>
              )}
            </VStack>
          </div>
        </Section>
      )}

      <Section
        title="Gemini 켜기"
        hint="키는 서버에만 저장되고 다시 보여 주지 않아요. 시연이 끝나면 아래 '규칙 기반으로'를 눌러 지우고, 구글에서 키를 재발급하세요."
      >
        <div className="ff-box">
          <VStack spacing={8}>
            <TextInput
              type="password"
              value={apiKey}
              placeholder="Gemini API 키"
              disabled={busy}
              onChange={(event) => setApiKey(event.target.value)}
            />
            <TextInput
              value={model}
              placeholder="gemini-3.1-flash-lite"
              disabled={busy}
              onChange={(event) => setModelName(event.target.value)}
            />
            <HStack
              spacing={8}
              wrap
            >
              <Button
                size="m"
                variant="filled"
                semantic="primary"
                label="Gemini 켜기"
                loading={busy}
                disabled={busy || !apiKey.trim()}
                onClick={() => void apply('gemini')}
              />
              <Button
                size="m"
                variant="outlined"
                semantic="secondary"
                label="규칙 기반으로 (키 삭제)"
                loading={busy}
                disabled={busy}
                onClick={() => void apply('rule')}
              />
            </HStack>
          </VStack>
        </div>
      </Section>
    </VStack>
  )
}

export default ModelSettingsPage
