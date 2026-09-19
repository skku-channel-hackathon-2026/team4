import { useState } from 'react'
import { Button, HStack, Text, VStack } from '@channel.io/bezier-react/beta'
import {
  CAMPUS_LABELS,
  SKKU_COLLEGES,
  findCollege,
  majorLabel,
  type Major,
} from '@tutorial/shared'

import Chip from './Chip'

interface MajorPickerProps {
  major?: Major
  onChange: (major?: Major) => void
}

/**
 * 전공 선택. 단과대학을 고른 뒤 학과를 고르는 2단계 클릭이다.
 * 학과가 70개 가까워서 한 화면에 다 펼치면 좁은 WAM에서 읽히지 않고,
 * 타이핑을 시키면 "클릭으로 고르고 세부만 자연어" 원칙과 어긋난다.
 *
 * 선택 입력이다. 1학년은 아직 학과가 없을 수 있어 단과대학만 고르고 넘어가도 된다.
 */
function MajorPicker({ major, onChange }: MajorPickerProps) {
  const [open, setOpen] = useState(false)
  const [collegeId, setCollegeId] = useState(major?.collegeId ?? '')
  const college = findCollege(collegeId)

  if (!open) {
    return (
      <div className="ff-box ff-major">
        <HStack
          spacing={8}
          align="center"
          justify="between"
        >
          <VStack spacing={2}>
            <Text
              as="span"
              typo="13"
              bold
            >
              {major ? majorLabel(major) : '전공 (선택)'}
            </Text>
            <Text
              as="span"
              typo="12"
              color="text-neutral-lighter"
            >
              {major
                ? '상황 확인과 사례 비교 화면에 함께 표시돼요.'
                : '골라 두면 상황 요약에 함께 남아요. 건너뛰어도 괜찮아요.'}
            </Text>
          </VStack>
          <Button
            size="xs"
            variant="outlined"
            semantic="secondary"
            label={major ? '변경' : '고르기'}
            onClick={() => setOpen(true)}
          />
        </HStack>
      </div>
    )
  }

  return (
    <div className="ff-box ff-major">
      <VStack spacing={10}>
        <HStack
          spacing={8}
          align="center"
          justify="between"
        >
          <Text
            as="span"
            typo="13"
            bold
          >
            {college ? '학과를 고르세요' : '단과대학을 고르세요'}
          </Text>
          <HStack spacing={4}>
            {college && (
              <Button
                size="xs"
                variant="ghost"
                semantic="secondary"
                label="단과대 다시"
                onClick={() => setCollegeId('')}
              />
            )}
            <Button
              size="xs"
              variant="ghost"
              semantic="secondary"
              label="닫기"
              onClick={() => setOpen(false)}
            />
          </HStack>
        </HStack>

        {!college ? (
          <HStack
            spacing={6}
            wrap
          >
            {SKKU_COLLEGES.map((item) => (
              <Chip
                key={item.id}
                label={item.name}
                active={false}
                onClick={() => setCollegeId(item.id)}
              />
            ))}
          </HStack>
        ) : (
          <VStack spacing={8}>
            <Text
              as="span"
              typo="12"
              color="text-neutral-lighter"
            >
              {college.name} · {CAMPUS_LABELS[college.campus]}
            </Text>
            <HStack
              spacing={6}
              wrap
            >
              {college.departments.map((department) => (
                <Chip
                  key={department}
                  label={department}
                  active={major?.department === department}
                  onClick={() => {
                    onChange({ collegeId: college.id, department })
                    setOpen(false)
                  }}
                />
              ))}
            </HStack>
            <HStack spacing={6}>
              <Button
                size="xs"
                variant="outlined"
                semantic="secondary"
                label="단과대학만 고르고 넘어가기"
                onClick={() => {
                  onChange({ collegeId: college.id })
                  setOpen(false)
                }}
              />
            </HStack>
          </VStack>
        )}

        {major && (
          <HStack spacing={6}>
            <Button
              size="xs"
              variant="ghost"
              semantic="secondary"
              label="전공 선택 지우기"
              onClick={() => {
                onChange(undefined)
                setCollegeId('')
                setOpen(false)
              }}
            />
          </HStack>
        )}
      </VStack>
    </div>
  )
}

export default MajorPicker
