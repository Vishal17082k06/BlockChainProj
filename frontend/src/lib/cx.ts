/** Joins class names, skipping anything falsy: cx(styles.a, isOn && styles.b). */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
