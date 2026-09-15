import { Workspace, useFleet } from '@hanzo/tabs';
import { SizableText, YStack } from '@hanzo/gui';

import { useAuth } from '../store/auth';

/**
 * Terminals, desktops and pages on the machines you have.
 *
 * NOT "Machines". A pane here is a machine's FACE — a shell, its display, a
 * page it can reach — and the machine itself is compute, which is its own
 * surface with its own inventory, sizes and bill. One noun for the faces and
 * another for the hardware, so neither has to be qualified.
 *
 * The same component tabs.hanzo.ai serves, mounted here rather than
 * reimplemented: one tiling of panes, one answer to what a split does, one set
 * of rules about when a frame is called dead. A second copy would look alike
 * for about a week.
 *
 * WHAT THIS HOST SUPPLIES is the token, and only that. `useFleet` reads the
 * registry, folds sessions and cloud boxes into machines, and mints a url per
 * pane; the workspace holds no credential at all. The token is the signed-in
 * user's own IAM bearer — the same one the mic uses for /v1/audio — so the
 * machines listed are the ones that identity actually has, and a box started
 * from here is billed to the org that person belongs to.
 *
 * Signed out there is nothing to list, and that is said rather than drawn as an
 * empty workspace: no machines and no identity are different facts.
 */
export function Terminals() {
  const token = useAuth((state) => state.auth?.hanzo_token ?? null);
  const { hosts, read, error, mint, launch } = useFleet(token);

  if (!token) {
    return (
      <Quiet>Sign in to Hanzo to see the machines this identity has.</Quiet>
    );
  }
  if (!read) {
    return <Quiet>{error ? 'The registry is unavailable.' : 'Reading your machines…'}</Quiet>;
  }

  return <Workspace hosts={hosts} mint={mint} onLaunch={launch} />;
}

/** One sentence, centred by its parent, in the ink used for text that is not
 *  the point of the screen. Three states share it, so they share its
 *  placement too. */
function Quiet({ children }: { children: string }) {
  return (
    <YStack flex={1} items="center" justify="center" p="$6">
      <SizableText size="$2" color="$color10">
        {children}
      </SizableText>
    </YStack>
  );
}
