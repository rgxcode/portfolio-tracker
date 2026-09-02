/**
 * How a holding's quantity is counted, and how cash is labelled.
 *
 * Metals are priced per troy ounce and copper per pound, so "5.5" alone is
 * ambiguous in a column that also holds share counts and coin balances. The
 * unit is the difference between five and a half ounces of gold and five and a
 * half of something else.
 *
 * The commodity list mirrors COMMODITIES in backend/src/jobs/commodities.js,
 * which is the source of truth — three entries that, as the comment there puts
 * it, change about never.
 */
export const COMMODITY_UNITS: Record<string, string> = {
  GOLD: 'oz',
  SILVER: 'oz',
  COPPER: 'lb',
}

/** Currencies a cash balance can be held in. Mirrors CASH_CURRENCIES. */
export const CURRENCIES: Array<{ code: string, name: string, symbol: string }> = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: '$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: '$' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: '$' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: '$' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: '$' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr' },
  { code: 'PLN', name: 'Polish Złoty', symbol: 'zł' },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'MXN', name: 'Mexican Peso', symbol: '$' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
  { code: 'ILS', name: 'Israeli Shekel', symbol: '₪' },
  { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft' },
  { code: 'RON', name: 'Romanian Leu', symbol: 'lei' },
]

const BY_CODE = new Map(CURRENCIES.map(c => [c.code, c]))

export function currencyName(code: string): string {
  return BY_CODE.get(code.toUpperCase())?.name ?? code.toUpperCase()
}

/**
 * The unit one quantity of this holding is counted in, or '' when the count
 * speaks for itself — nobody needs to be told that shares are shares.
 */
export function unitLabel(asset: { type: string, symbol: string, currency?: string | null }): string {
  if (asset.type === 'commodity') return COMMODITY_UNITS[asset.symbol.toUpperCase()] ?? ''
  if (asset.type === 'cash') return (asset.currency ?? asset.symbol).toUpperCase()
  return ''
}
