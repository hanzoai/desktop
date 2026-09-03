import { Header as Bar, HeaderButton } from '@hanzo/ui/chat'
import { PanelLeft } from '@hanzogui/lucide-icons-2'
import { PresenceStack } from '../presence/PresenceStack.tsx'

export interface HeaderProps {
  title: string
  rail: boolean
  onRail: () => void
}

export const Header = ({ title, rail, onRail }: HeaderProps) => (
  <Bar
    title={title}
    leading={
      <HeaderButton label={rail ? 'Hide conversations' : 'Show conversations'} onPress={onRail}>
        <PanelLeft size={16} />
      </HeaderButton>
    }
  >
    <PresenceStack />
  </Bar>
)
