import { useEffect, useState } from 'react'
import {
  Badge,
  Button,
  HStack,
  Text,
  VStack,
} from '@channel.io/bezier-react/beta'
import {
  EmptyState,
  InlineBanner,
  LoadingPage,
} from '@channel.io/app-sdk-wam-ui'
import { CATEGORIES, type Case, type CaseStatus } from '@tutorial/shared'

import { errorMessage } from '../../hooks/useFailfairApi'

interface ReviewPageProps {
  listCases: () => Promise<{ cases: Case[] }>
  reviewCase: (caseId: string, status: CaseStatus) => Promise<{ case: Case }>
}

const STATUS_LABEL: Record<CaseStatus, string> = {
  draft: '검수 대기',
  approved: '노출 중',
  hidden: '숨김',
}

/** 검수 화면. 해커톤에서는 매니저 누구나 승인할 수 있다. */
function ReviewPage({ listCases, reviewCase }: ReviewPageProps) {
  const [cases, setCases] = useState<Case[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listCases()
      .then((result) => {
        if (!cancelled) setCases(result.cases)
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(errorMessage(cause, '목록을 불러오지 못했어요.'))
      })
    return () => {
      cancelled = true
    }
  }, [listCases])

  const change = async (caseId: string, status: CaseStatus) => {
    setBusyId(caseId)
    setError(null)
    try {
      const { case: updated } = await reviewCase(caseId, status)
      setCases((current) =>
        (current ?? []).map((item) => (item.id === updated.id ? updated : item))
      )
    } catch (cause) {
      setError(errorMessage(cause, '상태를 바꾸지 못했어요.'))
    } finally {
      setBusyId(null)
    }
  }

  if (cases === null && !error)
    return <LoadingPage message="사례를 불러오는 중" />

  const sorted = [...(cases ?? [])].sort((a, b) => {
    const rank = (item: Case) => (item.status === 'draft' ? 0 : 1)
    return rank(a) - rank(b) || b.createdAt - a.createdAt
  })

  return (
    <VStack spacing={12}>
      {error && (
        <InlineBanner
          variant="error"
          content={error}
        />
      )}
      {sorted.length === 0 ? (
        <EmptyState
          title="등록된 사례가 없어요"
          description="선배 입력 화면에서 등록하면 여기에 쌓여요."
        />
      ) : (
        sorted.map((item) => (
          <div
            key={item.id}
            className="ff-box"
          >
            <VStack spacing={8}>
              <HStack
                spacing={6}
                wrap
              >
                <Badge
                  size="xs"
                  variant={
                    item.status === 'approved'
                      ? 'green'
                      : item.status === 'draft'
                        ? 'yellow'
                        : 'default'
                  }
                >
                  {STATUS_LABEL[item.status]}
                </Badge>
                <Badge
                  size="xs"
                  variant={item.sourceType === 'demo' ? 'purple' : 'blue'}
                >
                  {item.sourceType === 'demo' ? '가상 시연' : '실제 경험'}
                </Badge>
                <Badge
                  size="xs"
                  variant="default"
                >
                  {CATEGORIES.find((category) => category.id === item.category)
                    ?.name ?? item.category}
                </Badge>
              </HStack>
              <Text
                as="p"
                typo="15"
                bold
              >
                {item.title}
              </Text>
              <Text
                as="p"
                typo="13"
                color="text-neutral-light"
              >
                {item.situation}
              </Text>
              <HStack
                spacing={8}
                wrap
              >
                {item.status !== 'approved' && (
                  <Button
                    size="s"
                    variant="filled"
                    semantic="primary"
                    label="승인"
                    loading={busyId === item.id}
                    disabled={busyId !== null}
                    onClick={() => void change(item.id, 'approved')}
                  />
                )}
                {item.status !== 'hidden' && (
                  <Button
                    size="s"
                    variant="outlined"
                    semantic="destructive"
                    label="숨김"
                    loading={busyId === item.id}
                    disabled={busyId !== null}
                    onClick={() => void change(item.id, 'hidden')}
                  />
                )}
              </HStack>
            </VStack>
          </div>
        ))
      )}
    </VStack>
  )
}

export default ReviewPage
