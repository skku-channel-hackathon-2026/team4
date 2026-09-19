import { Text, VStack } from '@channel.io/bezier-react/beta'
import { CATEGORIES, type Category } from '@tutorial/shared'

interface CategoryPageProps {
  busy: boolean
  onPick: (category: Category) => void
}

/** v2 §3.1 1단계: 자연어 입력 전에 카테고리를 고른다. */
function CategoryPage({ busy, onPick }: CategoryPageProps) {
  return (
    <VStack spacing={12}>
      <Text
        as="p"
        typo="14"
        color="text-neutral-light"
      >
        어떤 종류의 고민인가요? 고르면 바로 대화가 시작돼요. 실명이나 상대
        이름은 말하지 않아도 돼요.
      </Text>
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
