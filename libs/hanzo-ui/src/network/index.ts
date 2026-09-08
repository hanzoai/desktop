/**
 * Network domain — the ONE selected-network model + selector for the
 * desktop. Vendored into the app's shared UI lib (was `@hanzo/ui/network`)
 * so the wallet brand-shell owns its network wiring; HANZO_NETWORKS is
 * brand data. Exposes exactly what the app consumes.
 */
export { NetworkSwitcher } from './NetworkSwitcher';
export { configureNetworks, getNetwork, useNetwork } from './store';
export { HANZO_NETWORKS, type Network } from './networks';
