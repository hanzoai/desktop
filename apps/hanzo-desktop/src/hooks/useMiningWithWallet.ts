import { getBrand } from '@hanzo_network/brand-config';
import { useEffect, useRef } from 'react';

import { useAuth } from '../store/auth';
import { useWallet } from '../store/wallet';
import { safeInvoke } from '../utils/tauri-check';

export const useMiningWithWallet = () => {
  const { wallet } = useWallet();
  const auth = useAuth((state) => state.auth);
  const hasStartedMining = useRef(false);

  useEffect(() => {
    const startMiningWithWallet = async () => {
      if (!wallet?.address || !auth || hasStartedMining.current) return;

      const brand = getBrand();
      await safeInvoke('mining_stop');
      await safeInvoke('mining_start', {
        walletAddress: wallet.address,
        chainId: brand.network.chainId,
      });

      hasStartedMining.current = true;
    };

    void startMiningWithWallet();
  }, [wallet?.address, auth]);

  useEffect(() => {
    if (!auth) {
      hasStartedMining.current = false;
    }
  }, [auth]);
};
