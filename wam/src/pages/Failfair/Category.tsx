import { Text, VStack } from '@channel.io/bezier-react/beta'
import { CATEGORIES, type Category, type Major } from '@tutorial/shared'

import MajorPicker from '../../components/failfair/MajorPicker'

interface CategoryPageProps {
  busy: boolean
  major?: Major
  onMajorChange: (major?: Major) => void
  onPick: (category: Category) => void
}

/** v2 §3.1 1단계: 자연어 입력 전에 카테고리를 고른다. */
function CategoryPage({
  busy,
  major,
  onMajorChange,
  onPick,
}: CategoryPageProps) {
  return (
    <VStack spacing={12}>
      <Text
        as="p"
        typo="14"
        color="text-neutral-light"
      >
        어떤 종류의 고민인가요? 고른 다음에는 상황을 편한 말로 적으면 돼요. 두세
        가지만 더 여쭤보고 바로 선배 사례를 보여 드려요. 실명이나 상대 이름은
        말하지 않아도 돼요.
      </Text>

      <MajorPicker
        major={major}
        onChange={onMajorChange}
      />

      {CATEGORIES.map((category) => (
        <button
          key={category.id}
          type="button"
          className="ff-big"
          disabled={busy}
          onClick={() => onPick(category.id)}
        >
          <Text
            as="span"
            typo="16"
            bold
          >
            {category.name}
          </Text>
          <Text
            as="span"
            typo="13"
            color="text-neutral-light"
          >
            {category.prompt}
          </Text>
        </button>
      ))}
    </VStack>
  )
}

export default CategoryPage
