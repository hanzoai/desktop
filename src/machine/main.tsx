import { Hanzo } from '@hanzo/ui'
import '@hanzo/font/css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { brand, wear } from '@hanzo/chat/brand'
import { Services } from './Services'

/**
 * The services window's mount.
 *
 * A window of its own is a document of its own, which is what Tauri opens and
 * what the bundler builds — so this is the same three lines as `src/main.tsx`
 * around a different screen, and nothing here decides which window it is in.
 * There is no session and no router: this window shows what a process on this
 * machine is doing, which is a question with no account and no address.
 */
wear()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Hanzo theme={brand.backdrop}>
      <Services />
    </Hanzo>
  </StrictMode>,
)
