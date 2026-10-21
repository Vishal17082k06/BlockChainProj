import { formatBlock, formatElapsed, formatEth, formatFee, formatGas, shortHash, timeAgo } from './format'

const NOW = 1_800_000_000_000          // a fixed "now" in milliseconds
const ago = (seconds: number) => NOW / 1000 - seconds

describe('timeAgo', () => {
  it.each([
    [3, 'just now'],
    [30, '30 s ago'],
    [90, '1 min ago'],
    [60 * 59, '59 min ago'],
    [3 * 3600, '3 h ago'],
    [2 * 86400, '2 d ago'],
  ])('%i seconds ago reads %s', (seconds, text) => {
    expect(timeAgo(ago(seconds), NOW)).toBe(text)
  })

  it('treats a time slightly in the future as just now, and a missing time as a dash', () => {
    expect(timeAgo(ago(-5), NOW)).toBe('just now')
    expect(timeAgo(null, NOW)).toBe('—')
  })
})

describe('numbers', () => {
  it('groups block numbers and gas with thousands separators', () => {
    expect(formatBlock(11953472)).toBe('11,953,472')
    expect(formatGas(6695317)).toBe('6,695,317')
    expect(formatBlock(null)).toBe('—')
  })

  it('trims useless trailing zeros from an ETH amount', () => {
    expect(formatEth('0.000084331000')).toBe('0.000084331')
    expect(formatEth('0.050000')).toBe('0.05')
    expect(formatEth('1.000000')).toBe('1')
    expect(formatEth('0.000000000')).toBe('0')
    expect(formatEth(null)).toBe('—')
  })

  it('never shows a fee that was really paid as plain zero', () => {
    // Sepolia gas can cost a few wei: the API rounds that to nine decimals, which reads as 0.
    expect(formatFee('0.000000000')).toBe('<0.000000001')
    expect(formatFee('0.000084331000')).toBe('0.000084331')
    expect(formatFee(null)).toBe('—')
  })

  it('formats elapsed time at the right scale', () => {
    expect(formatElapsed(86)).toBe('86 ms')
    expect(formatElapsed(1234)).toBe('1.2 s')
    expect(formatElapsed(65_000)).toBe('1 min 5 s')
  })
})

describe('shortHash', () => {
  const tx = '0x69acef310151fcb7568e6869671c97b42ab43d89c83e5740abe99c6271376a43'
  it('keeps the start and end of a long hash', () => {
    expect(shortHash(tx)).toBe('0x69ac…6a43')
    expect(shortHash(tx, 10, 6)).toBe('0x69acef31…376a43')
  })

  it('shows only the start when no tail is asked for', () => {
    expect(shortHash(tx, 8, 0)).toBe('0x69acef…')
  })

  it('leaves a short value alone', () => {
    expect(shortHash('0xabc')).toBe('0xabc')
  })
})
