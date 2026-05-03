import { Button } from '@hanzo_network/hanzo-ui';
import { ChevronRight, Wallet, WifiOff } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { useMiningWithWallet } from '../../hooks/useMiningWithWallet';
import { useWallet } from '../../store/wallet';
import { isTauriAvailable, safeInvoke, safeListen } from '../../utils/tauri-check';

interface MiningStatusProps {
  sidebarExpanded: boolean;
}

interface MiningState {
  wallet_address: string;
  balance: number;
  is_mining: boolean;
  last_updated: number;
}

export const MiningStatus: React.FC<MiningStatusProps> = ({
  sidebarExpanded,
}) => {
  const navigate = useNavigate();
  const [balance, setBalance] = useState(0);
  const [walletAddress, setWalletAddress] = useState('Loading...');
  const [isMining, setIsMining] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
        setBalance(state.balance);
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
      setBalance((prev) => {
        if (audioRef.current && state.balance > prev) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => undefined);
        }
        return state.balance;
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

  useEffect(() => {
    const audio = new Audio();
    audio.src =
      'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjCM0fPTgjMGHGq96OegWBEMTKXh8bllHAU2jdXyzn0pBi==';
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = '';
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
      className="border-divider group flex w-full items-center gap-3 border-t px-4 py-3 hover:bg-white/5"
      onClick={handleWalletClick}
      size="auto"
      variant="ghost"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
        <Wallet className="h-6 w-6 text-white" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <div className="flex items-center gap-2">
          {isOnline ? (
            <>
              <span className="text-lg font-bold text-white">
                ${balance.toFixed(1)}
              </span>
              <span className="text-xs text-white/60">AI</span>
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
