/**
 * Symbol → CoinGecko id map for the tokens we track.
 *
 * This is the single source of truth for which coins the price job fetches.
 * Add a line here and the next scheduled run picks it up — no other changes needed.
 */
export const COIN_IDS = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDT: 'tether',
  BNB: 'binancecoin',
  SOL: 'solana',
  USDC: 'usd-coin',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  TRX: 'tron',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
  DOT: 'polkadot',
  MATIC: 'matic-network',
  LTC: 'litecoin',
  SHIB: 'shiba-inu',
  UNI: 'uniswap',
  ATOM: 'cosmos',
  XLM: 'stellar',
  NEAR: 'near',
  ALGO: 'algorand',
  ICP: 'internet-computer',
  FIL: 'filecoin',
  APT: 'aptos',
  ARB: 'arbitrum',
  OP: 'optimism',
  AAVE: 'aave',
  SUI: 'sui',
  INJ: 'injective-protocol',
  TIA: 'celestia',
}

/** Human-readable names, used when the app has no name stored for a symbol. */
export const COIN_NAMES = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  USDT: 'Tether',
  BNB: 'BNB',
  SOL: 'Solana',
  USDC: 'USD Coin',
  XRP: 'XRP',
  ADA: 'Cardano',
  DOGE: 'Dogecoin',
  TRX: 'TRON',
  AVAX: 'Avalanche',
  LINK: 'Chainlink',
  DOT: 'Polkadot',
  MATIC: 'Polygon',
  LTC: 'Litecoin',
  SHIB: 'Shiba Inu',
  UNI: 'Uniswap',
  ATOM: 'Cosmos',
  XLM: 'Stellar',
  NEAR: 'NEAR Protocol',
  ALGO: 'Algorand',
  ICP: 'Internet Computer',
  FIL: 'Filecoin',
  APT: 'Aptos',
  ARB: 'Arbitrum',
  OP: 'Optimism',
  AAVE: 'Aave',
  SUI: 'Sui',
  INJ: 'Injective',
  TIA: 'Celestia',
}

/** Reverse lookup: CoinGecko id → symbol. */
export const ID_TO_SYMBOL = Object.fromEntries(
  Object.entries(COIN_IDS).map(([symbol, id]) => [id, symbol]),
)
