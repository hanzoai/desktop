/**
 * Unified Room Section in the Rail: Channels, DMs (People & Agents), and Informal Groups.
 */
import {
  Plus,
  Bot,
  Hash,
  Lock,
  Users,
} from '@hanzogui/lucide-icons-2'
import { SizableText, XStack, YStack } from '@hanzo/ui'
import { useShown } from '~/show'
import { channelsStore, useChannels, type ChatRoom } from './store'

/** One "N more" affordance, so no list here is cut without saying so. */
const More = ({ of }: { of: { more: number; total: number; grow: () => void } }) =>
  of.more > 0 ? (
    <button
      type="button"
      onClick={of.grow}
      className="tap"
      style={{
        textAlign: 'left',
        padding: '4px 8px',
        borderRadius: 4,
        background: 'transparent',
        border: 'none',
        color: 'rgba(255,255,255,0.4)',
        fontSize: 11,
        cursor: 'pointer',
      }}
    >
      {of.more} more of {of.total}
    </button>
  ) : null

export const ChannelSection = () => {
  const { rooms, activeRoomId } = useChannels()

  // `GET /v1/team/rooms` takes NO limit — it answers every room the org has —
  // so the rail bounds what it draws and says what it is holding back. A rail
  // silently cut at twenty is how somebody concludes their org has twenty rooms.
  const channels = useShown(
    rooms.filter((r) => r.type === 'channel'),
    30,
  )
  const dms = useShown(
    rooms.filter((r) => r.type === 'dm'),
    30,
  )
  const groups = useShown(
    rooms.filter((r) => r.type === 'group'),
    30,
  )

  const getGroupLabel = (r: ChatRoom) => {
    if (r.name) return r.name
    // Informal group label derived from participant count
    return `Group (${r.members.length} members)`
  }

  return (
    <YStack gap="$2" paddingVertical="$1">
      {/* Channels Section */}
      <YStack gap="$0.5">
        <XStack alignItems="center" justifyContent="space-between" paddingHorizontal="$2" paddingBottom="$1">
          <SizableText size="$1" fontWeight="700" color="$faint" style={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10 }}>
            Channels
          </SizableText>
          {/* Only channels can be opened. `teamRoomNew` has no `direct`, so a
              DM is not something this route creates. */}
          <button
            type="button"
            onClick={() => channelsStore.openCreate()}
            title="Open a channel"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 18,
              height: 18,
              borderRadius: 4,
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: 'rgba(255, 255, 255, 0.7)',
              cursor: 'pointer',
            }}
          >
            <Plus size={11} />
          </button>
        </XStack>

        {channels.rows.map((chan) => {
          const isActive = chan.id === activeRoomId
          return (
            <button
              key={chan.id}
              type="button"
              onClick={() => channelsStore.setActiveRoom(chan.id)}
              className="tap"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '5px 8px',
                borderRadius: 6,
                background: isActive ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                transition: 'background 0.12s ease',
              }}
            >
              <XStack alignItems="center" gap="$2" flex={1} minWidth={0}>
                {chan.isPrivate ? (
                  <Lock size={12} color={isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.4)'} />
                ) : (
                  <Hash size={13} color={isActive ? '#34d399' : 'rgba(255, 255, 255, 0.4)'} />
                )}
                <SizableText
                  size="$1"
                  fontWeight={isActive ? '600' : '400'}
                  color="$ink"
                  numberOfLines={1}
                  style={{
                    color: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.75)',
                    fontSize: 12,
                  }}
                >
                  {chan.name}
                </SizableText>
              </XStack>

              {chan.unreadCount && chan.unreadCount > 0 ? (
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    background: '#34d399',
                    color: '#000000',
                    padding: '1px 5px',
                    borderRadius: 9999,
                  }}
                >
                  {chan.unreadCount}
                </span>
              ) : null}
            </button>
          )
        })}
        <More of={channels} />
      </YStack>

      {/* Direct Messages & Agents Section */}
      <YStack gap="$0.5" paddingTop="$1">
        <XStack alignItems="center" justifyContent="space-between" paddingHorizontal="$2" paddingBottom="$1">
          <SizableText size="$1" fontWeight="700" color="$faint" style={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10 }}>
            Direct Messages & Agents
          </SizableText>
        </XStack>

        {dms.rows.map((dm) => {
          const isActive = dm.id === activeRoomId
          const isAgent = dm.name?.startsWith('@')
          return (
            <button
              key={dm.id}
              type="button"
              onClick={() => channelsStore.setActiveRoom(dm.id)}
              className="tap"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '5px 8px',
                borderRadius: 6,
                background: isActive ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                transition: 'background 0.12s ease',
              }}
            >
              <XStack alignItems="center" gap="$2" flex={1} minWidth={0}>
                {isAgent ? (
                  <Bot size={13} color={isActive ? '#818cf8' : 'rgba(129, 140, 248, 0.6)'} />
                ) : (
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 9999,
                      background: '#34d399',
                      boxShadow: '0 0 4px #34d399',
                    }}
                  />
                )}
                <SizableText
                  size="$1"
                  fontWeight={isActive ? '600' : '400'}
                  color="$ink"
                  numberOfLines={1}
                  style={{
                    color: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.75)',
                    fontSize: 12,
                  }}
                >
                  {dm.name}
                </SizableText>
              </XStack>

              {dm.unreadCount && dm.unreadCount > 0 ? (
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    background: isAgent ? '#818cf8' : '#34d399',
                    color: '#000000',
                    padding: '1px 5px',
                    borderRadius: 9999,
                  }}
                >
                  {dm.unreadCount}
                </span>
              ) : null}
            </button>
          )
        })}
        <More of={dms} />
      </YStack>

      {/* Informal Groups Section */}
      <YStack gap="$0.5" paddingTop="$1">
        <XStack alignItems="center" justifyContent="space-between" paddingHorizontal="$2" paddingBottom="$1">
          <SizableText size="$1" fontWeight="700" color="$faint" style={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10 }}>
            Informal Groups
          </SizableText>
        </XStack>

        {groups.rows.map((grp) => {
          const isActive = grp.id === activeRoomId
          return (
            <button
              key={grp.id}
              type="button"
              onClick={() => channelsStore.setActiveRoom(grp.id)}
              className="tap"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '5px 8px',
                borderRadius: 6,
                background: isActive ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                transition: 'background 0.12s ease',
              }}
            >
              <XStack alignItems="center" gap="$2" flex={1} minWidth={0}>
                <Users size={13} color={isActive ? '#fbbf24' : 'rgba(251, 191, 36, 0.6)'} />
                <SizableText
                  size="$1"
                  fontWeight={isActive ? '600' : '400'}
                  color="$ink"
                  numberOfLines={1}
                  style={{
                    color: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.75)',
                    fontSize: 12,
                  }}
                >
                  {getGroupLabel(grp)}
                </SizableText>
              </XStack>
            </button>
          )
        })}
        <More of={groups} />
      </YStack>
    </YStack>
  )
}
