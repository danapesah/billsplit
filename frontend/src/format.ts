const ils = new Intl.NumberFormat('en-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const ilsWhole = new Intl.NumberFormat('en-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

export function formatIls(amount: number): string {
  return ils.format(amount)
}

/** Whole shekels — no agorot on Total to pay */
export function formatIlsWhole(amount: number): string {
  return ilsWhole.format(amount)
}
