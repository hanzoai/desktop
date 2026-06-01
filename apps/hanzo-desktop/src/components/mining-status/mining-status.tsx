import { Button } from '@hanzo_network/hanzo-ui';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Wallet, WifiOff } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { useMiningWithWallet } from '../../hooks/useMiningWithWallet';
import { useWallet } from '../../store/wallet';
import { isTauriAvailable, safeInvoke, safeListen } from '../../utils/tauri-check';

// Synthesize a 3-note ascending coin-jingle using Web Audio (no asset file).
// Triggered when balance increases. ~250ms total. Falls back silently if
// AudioContext is unavailable.
function playCoinJingle() {
  try {
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    // E5, A5, C#6 — bright major triad arpeggio
    const notes = [659.25, 880.0, 1108.73];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + i * 0.07;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
    setTimeout(() => void ctx.close(), 600);
  } catch {
    /* swallow — sound is non-essential */
  }
}

interface MiningStatusProps {
  sidebarExpanded: boolean;
}

interface MiningState {
  wallet_address: string;
  is_mining: boolean;
  last_updated: number;
  local_pending_wei: string;
  history_count: number;
}

// Convert wei (decimal string) to a token-unit number for sidebar display.
// 4 decimal places is plenty for the small "+x AI" pulse animation.
function weiToTokenNumber(wei: string | undefined): number {
  if (!wei) return 0;
  try {
    const n = BigInt(wei);
    const whole = n / 10n ** 18n;
    const frac = n % 10n ** 18n;
    return Number(whole) + Number(frac) / 1e18;
  } catch {
    return 0;
  }
}

export const MiningStatus: React.FC<MiningStatusProps> = ({
  sidebarExpanded,
}) => {
  const navigate = useNavigate();
  const [balance, setBalance] = useState(0);
  const [walletAddress, setWalletAddress] = useState('Loading...');
  const [isMining, setIsMining] = useState(false);
  const [pulses, setPulses] = useState<{ id: number; delta: number }[]>([]);
  const pulseIdRef = useRef(0);

  const handleBalanceIncrease = (delta: number) => {
    if (delta <= 0) return;
    playCoinJingle();
    const id = ++pulseIdRef.current;
    setPulses((prev) => [...prev, { id, delta }]);
    // Auto-remove after animation lifetime
    window.setTimeout(
      () => setPulses((prev) => prev.filter((p) => p.id !== id)),
      1400,
    );
  };

  useMiningWithWallet();
  const { wallet } = useWallet();

  useEffect(() => {
    const loadMiningState = async () => {
      if (!isTauriAvailable()) {
        setWalletAddress(wallet?.address || '0x0000...0000');
        setBalance(0);
        setIsMining(false);
        return;
      }

      const state = await safeInvoke<MiningState>('mining_get_state');
      if (state) {
        setBalance(weiToTokenNumber(state.local_pending_wei));
        setWalletAddress(wallet?.address || state.wallet_address);
        setIsMining(state.is_mining);
      } else {
        setWalletAddress(wallet?.address || '0x0000...0000');
      }
    };

    void loadMiningState();
  }, [wallet?.address]);

  useEffect(() => {
    if (!isTauriAvailable()) return;

    let unlisten: (() => void) | null = null;

    void safeListen<MiningState>('mining-update', (event) => {
      const state = event.payload;
      const next = weiToTokenNumber(state.local_pending_wei);
      setBalance((prev) => {
        if (next > prev) handleBalanceIncrease(next - prev);
        return next;
      });
      setWalletAddress(state.wallet_address);
      setIsMining(state.is_mining);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  const handleWalletClick = () => {
    void navigate('/settings/crypto-wallet');
  };

  const isOnline = isMining && walletAddress !== 'Loading...';

  if (!sidebarExpanded) {
    return (
      <Button
        className="border-divider flex w-full items-center justify-center border-t p-2 hover:bg-white/5"
        onClick={handleWalletClick}
        size="auto"
        variant="ghost"
      >
        <Wallet className="h-5 w-5 text-white" />
      </Button>
    );
  }

  return (
    <Button
      className="border-divider group relative flex w-full items-center gap-3 border-t px-4 py-3 hover:bg-white/5"
      onClick={handleWalletClick}
      size="auto"
      variant="ghost"
    >
      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
        {isMining && (
          <span className="absolute inset-0 animate-ping rounded-2xl bg-emerald-400/30" />
        )}
        <Wallet className="relative h-6 w-6 text-white" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <div className="relative flex items-center gap-2">
          {isOnline ? (
            <>
              <span className="text-lg font-bold text-white">
                ${balance.toFixed(1)}
              </span>
              <span className="text-xs text-white/60">AI</span>
              <AnimatePresence>
                {pulses.map((p) => (
                  <motion.span
                    key={p.id}
                    className="pointer-events-none absolute -top-1 left-0 text-xs font-semibold text-emerald-400"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: -18 }}
                    exit={{ opacity: 0, y: -28 }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                  >
                    +{p.delta.toFixed(1)} AI
                  </motion.span>
                ))}
              </AnimatePresence>
            </>
          ) : (
            <div className="flex items-center gap-1.5">
              <WifiOff className="h-3.5 w-3.5 text-red-400" />
              <span className="text-sm text-red-400">Offline</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-white/60">
          <span className="font-mono">
            {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
          </span>
        </div>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-white/40 transition-colors group-hover:text-white/60" />
    </Button>
  );
};
