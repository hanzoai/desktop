import { invoke } from '@tauri-apps/api/core';

export const openHanzoNodeManagerWindow = async () => {
  return invoke('show_hanzo_node_manager_window');
};

export const isLocalHanzoNode = (nodeAddress: string) => {
  const isLocalHanzoNode =
    nodeAddress.includes('localhost') || nodeAddress.includes('127.0.0.1');
  return isLocalHanzoNode;
};

export const isHostingHanzoNode = (nodeAddress: string) => {
  return nodeAddress?.includes('hosting.hanzo.com');
};
