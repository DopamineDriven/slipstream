const UNITS = ["B", "KB", "MB", "GB"] as const;

export function formatBytes(bytes: number | undefined) {
  if (bytes === undefined || !Number.isFinite(bytes)) return undefined;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}

/** The viewer's locale and tz come from the cookie context, as `formatTime` in helpers takes them. */
export function formatDate(date: Date | undefined, locale: string, tz: string) {
  if (!date) return undefined;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: decodeURIComponent(tz)
  }).format(date);
}

export function formatDateTime(
  date: Date | undefined,
  locale: string,
  tz: string
) {
  if (!date) return undefined;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: decodeURIComponent(tz),
    timeZoneName: "short"
  }).format(date);
}

export function truncateMiddle(value: string, keep = 10) {
  if (value.length <= keep * 2 + 1) return value;
  return `${value.slice(0, keep)}…${value.slice(-keep)}`;
}
