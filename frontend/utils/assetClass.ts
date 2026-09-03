/**
 * What kind of thing a holding is, for the purpose of grouping the book.
 *
 * Distinct from `asset.type`, which says how a holding is *priced* — which
 * bucket of the snapshot answers for it. Those are not the same question. A
 * fund is quoted on an exchange exactly like a share, so it is priced as a
 * stock, but a semiconductor ETF is not a semiconductor company and filing it
 * under Stocks makes the book look like something it is not.
 *
 * So the class is derived rather than stored: nothing needs migrating, and a
 * holding reclassifies itself the moment better information arrives.
 */

export type AssetClass = 'crypto' | 'stock' | 'etf' | 'commodity' | 'cash'

/**
 * Yahoo's own word for the instrument, carried through on the quote. This is
 * the authoritative half of the answer where it exists.
 */
const FUND_INSTRUMENTS = new Set(['ETF', 'MUTUALFUND'])

/**
 * The other half, from the name.
 *
 * Needed because Yahoo reports exchange-traded *commodities* as EQUITY —
 * Xetra-Gold and WisdomTree Physical Gold both claim to be companies — so the
 * flag alone silently files every ETC back under Stocks. It also covers a
 * holding quoted by the Alpha Vantage fallback, which reports no instrument
 * type at all.
 *
 * Deliberately case-sensitive: these are acronyms, and matching loosely would
 * catch a company whose name merely trails off in "etc.".
 */
const FUND_NAME = /\b(?:ETF|ETC|ETN)\b|UCITS/

interface Classifiable {
  type: string
  name?: string | null
  /** Yahoo's instrumentType, where the quote carried one. */
  instrumentType?: string | null
}

export function assetClass(asset: Classifiable): AssetClass {
  // Coins, metals and cash already say what they are.
  if (asset.type !== 'stock') return asset.type as AssetClass
  if (FUND_INSTRUMENTS.has(String(asset.instrumentType ?? '').toUpperCase())) return 'etf'
  if (FUND_NAME.test(asset.name ?? '')) return 'etf'
  return 'stock'
}

/**
 * Display names per class.
 *
 * "ETFs" rather than "Funds" because that is what these are called by the
 * people who hold them, and the bucket is dominated by them — though it also
 * takes in ETCs, ETNs and mutual funds, none of which belong beside a company.
 */
export const CLASS_LABELS: Record<AssetClass, string> = {
  crypto: 'Crypto',
  stock: 'Stocks',
  etf: 'ETFs',
  commodity: 'Commodities',
  cash: 'Cash',
}

/** An unknown class shows as itself rather than as something it is not. */
export function classLabel(c: string): string {
  return CLASS_LABELS[c as AssetClass] ?? (c ? c[0].toUpperCase() + c.slice(1) : 'Other')
}

/** One call for the common case: what band does this holding belong in. */
export function assetClassLabel(asset: Classifiable): string {
  return classLabel(assetClass(asset))
}
