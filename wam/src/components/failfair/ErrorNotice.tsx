import { InlineBanner } from '@channel.io/app-sdk-wam-ui'
import { Button, HStack, Text, VStack } from '@channel.io/bezier-react/beta'

import type { FailfairError } from '../../utils/failfairError'

interface ErrorNoticeProps {
  error: FailfairError
  busy: boolean
  onRetry: () => void
  onRestart: () => void
  onDismiss: () => void
}

/**
 * v2 §10의 오류 코드를 한 덩어리로 보여 준다.
 * 배너만 띄우고 끝내지 않고, 코드가 허용하는 다음 행동을 같이 준다.
 */
function ErrorNotice({
  error,
  busy,
  onRetry,
  onRestart,
  onDismiss,
}: ErrorNoticeProps) {
  return (
    <div className="ff-error">
      <VStack spacing={8}>
        <InlineBanner
          variant="error"
          content={error.message}
        />
        {error.hint && (
          <Text
            as="p"
            typo="13"
            color="text-neutral-light"
          >
            {error.hint}
          </Text>
        )}
        <HStack
          spacing={6}
          wrap
        >
          {error.action === 'retry' && (
            <Button
              size="s"
              variant="filled"
              semantic="primary"
              label="다시 시도"
              loading={busy}
              disabled={busy}
              onClick={onRetry}
            />
          )}
          {error.action === 'restart' && (
            <Button
              size="s"
              variant="filled"
              semantic="primary"
              label="처음부터 다시"
              disabled={busy}
              onClick={onRestart}
            />
          )}
          <Button
            size="s"
            variant="ghost"
            semantic="secondary"
            label="닫기"
            disabled={busy}
            onClick={onDismiss}
          />
        </HStack>
      </VStack>
    </div>
  )
}

export default ErrorNotice
