export function formatUSD(n: number | null | undefined): string {
  if (n == null) return '$0.00';
  return `$${Number(n).toFixed(2)}`;
}

export function formatUSDPrecise(n: number | null | undefined): string {
  if (n == null) return '$0.0000';
  return `$${Number(n).toFixed(4)}`;
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatMs(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
