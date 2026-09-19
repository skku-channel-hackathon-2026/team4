import type { ReactNode } from 'react'
import { Text, VStack } from '@channel.io/bezier-react/beta'

interface SectionProps {
  title: string
  hint?: string
  children: ReactNode
}

function Section({ title, hint, children }: SectionProps) {
  return (
    <VStack spacing={8}>
      <VStack spacing={2}>
        <Text
          as="h3"
          typo="13"
          bold
          color="text-neutral-light"
        >
          {title}
        </Text>
        {hint && (
          <Text
            as="p"
            typo="12"
            color="text-neutral-lighter"
          >
            {hint}
          </Text>
        )}
      </VStack>
      {children}
    </VStack>
  )
}

export default Section
