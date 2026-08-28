/** Browser-only file delivery kept outside the observable UI state bridge. */
export function triggerJsonDownload(filename: string, data: unknown): void {
  if (data === null || data === undefined) return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
