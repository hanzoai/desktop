import { getBrand } from '@hanzo_network/brand-config';
import { useEffect, useRef } from 'react';

import { useAuth } from '../store/auth';
import { useSelectedAccount } from '../lib/lux-wallet';
import { safeInvoke } from '../utils/tauri-check';

export const useMiningWithWallet = () => {
  const account = useSelectedAccount();
  const auth = useAuth((state) => state.auth);
  const hasStartedMining = useRef(false);

  useEffect(() => {
    const startMiningWithWallet = async () => {
      if (!account?.evmAddress || !auth || hasStartedMining.current) return;

      const brand = getBrand();
      await safeInvoke('mining_stop');
      await safeInvoke('mining_start', {
        walletAddress: account.evmAddress,
        chainId: brand.network.chainId,
      });

      hasStartedMining.current = true;
    };

    void startMiningWithWallet();
  }, [account?.evmAddress, auth]);

  useEffect(() => {
    if (!auth) {
      hasStartedMining.current = false;
    }
  }, [auth]);
};
