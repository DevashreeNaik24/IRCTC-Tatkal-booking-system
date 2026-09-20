/**
 * Normalize a Date or date-string into the `YYYY-MM-DD` format used in
 * Redis inventory keys and the `journey_date` column.
 */
export function formatDate(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return value.slice(0, 10);
}

/**
 * Format a date for human display.
 */
export function formatDateTime(value: Date | string): string {
  return new Date(value).toLocaleString();
}