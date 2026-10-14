import { PORTALDOT_RPC_URL } from "./env";

/**
 * The app is configured by RPC URL, so derive what users are actually looking at from it.
 * A local anvil uses the configured endpoint; its balances and tenders are test data.
 */
export const IS_LOCAL_CHAIN = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/.test(PORTALDOT_RPC_URL);

export const NETWORK_NAME = IS_LOCAL_CHAIN ? "Local test chain" : "PortaldotV3 Testnet";
