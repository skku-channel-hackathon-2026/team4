import { Button } from '@channel.io/bezier-react/beta'

interface ChipProps {
  label: string
  active: boolean
  onClick: () => void
  disabled?: boolean
}

function Chip({ label, active, onClick, disabled }: ChipProps) {
  return (
    <Button
      size="xs"
      variant={active ? 'filled' : 'outlined'}
      semantic={active ? 'primary' : 'secondary'}
      label={label}
      disabled={disabled}
      onClick={onClick}
    />
  )
}

export default Chip
