import { SkeletonBox } from '@channel.io/app-sdk-wam-ui'
import { Text, VStack } from '@channel.io/bezier-react/beta'

interface CompareSkeletonProps {
  /** 비교 중인 행동 수. 카드 개수를 미리 맞춰 화면이 덜 흔들린다. */
  count: number
}

function Card() {
  return (
    <div className="ff-box">
      <VStack spacing={10}>
        <SkeletonBox
          width={92}
          height={18}
          borderRadius={9}
        />
        <SkeletonBox
          width="70%"
          height={20}
        />
        <SkeletonBox height={12} />
        <SkeletonBox
          width="88%"
          height={12}
        />
        <SkeletonBox
          width="60%"
          height={12}
        />
      </VStack>
    </div>
  )
}

/** 사례 검색은 모델 호출을 거쳐 몇 초 걸린다. 그동안 빈 화면을 보여 주지 않는다. */
function CompareSkeleton({ count }: CompareSkeletonProps) {
  return (
    <VStack spacing={16}>
      <Text
        as="p"
        typo="14"
        color="text-neutral-light"
      >
        행동마다 비슷한 상황을 겪은 선배 사례를 찾고 있어요. 몇 초 걸려요.
      </Text>
      {Array.from({ length: Math.max(1, Math.min(count, 3)) }).map(
        (_, index) => (
          <Card key={index} />
        )
      )}
    </VStack>
  )
}

export default CompareSkeleton
