import { cx } from '@/lib/cx'

/**
 * The three proficiency keys under the Stack groups (design-home.md § 8
 * "Legend"). The swatches encode exactly what the chips encode — a filled
 * ground for Core, a strong outline for Working, a subtle outline for
 * Familiar — so the legend is a real key rather than decoration.
 *
 * `flex-wrap` is the entire responsive behaviour: three 20px-gapped keys fit
 * a 358px column at 390 without one.
 */
export type StackLegendLevel = 'core' | 'working' | 'familiar'

const LEVELS: ReadonlyArray<{ level: StackLegendLevel; label: string }> = [
  { level: 'core', label: 'Core' },
  { level: 'working', label: 'Working' },
  { level: 'familiar', label: 'Familiar' },
]

export function StackLegend({ className }: { className?: string }) {
  return (
    <div className={cx('stack-legend', className)}>
      {LEVELS.map(({ level, label }) => (
        <span key={level} className="stack-legend-key">
          <span aria-hidden="true" data-level={level} className="stack-legend-swatch" />
          {label}
        </span>
      ))}
    </div>
  )
}
