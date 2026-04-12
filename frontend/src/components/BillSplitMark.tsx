type BillSplitMarkProps = {
  className?: string
}

export function BillSplitMark({ className = 'h-9 w-9' }: BillSplitMarkProps) {
  return (
    <img
      src="/billsplit-icon.svg"
      alt=""
      className={className}
      width={36}
      height={36}
      decoding="async"
    />
  )
}
