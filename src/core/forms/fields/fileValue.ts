/** The wire format: an uploaded file is only ever its URL. */
export type UploadedFile = string;
export type FileUploadValue = UploadedFile | UploadedFile[] | null;

export type PanelLayout = 'grid' | 'list';

/**
 * The slice of `FileUploadConfig` that decides whether a picked `File` is
 * allowed. Shared so the control can reject a *dropped* file — the `accept`
 * attribute only constrains the browse dialog.
 */
export interface FileConstraintConfig {
  imageOnly?: boolean;
  acceptedFileTypes?: string[];
  previewable?: boolean;
  panelLayout?: PanelLayout;
}

export function toFileList(value: FileUploadValue): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).filter(
    (entry): entry is string => typeof entry === 'string' && entry !== '',
  );
}

export function acceptedTypesFor(config: FileConstraintConfig): string[] | undefined {
  if (config.acceptedFileTypes?.length) return config.acceptedFileTypes;
  return config.imageOnly ? ['image/*'] : undefined;
}

export function matchesAcceptedType(file: File, config: FileConstraintConfig): boolean {
  const accepted = acceptedTypesFor(config);
  if (!accepted?.length) return true;

  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  return accepted.some((entry) => {
    const rule = entry.trim().toLowerCase();
    if (!rule) return false;
    if (rule.startsWith('.')) return name.endsWith(rule);
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

export function effectiveLayout(config: FileConstraintConfig): PanelLayout {
  if (config.panelLayout) return config.panelLayout;
  return config.imageOnly && config.previewable !== false ? 'grid' : 'list';
}

export function formatFileSize(kilobytes: number): string {
  if (kilobytes >= 1024 * 1024) return `${Math.round((kilobytes / 1024 / 1024) * 10) / 10} GB`;
  if (kilobytes >= 1024) return `${Math.round((kilobytes / 1024) * 10) / 10} MB`;
  return `${Math.round(kilobytes)} KB`;
}

export function fileNameFromUrl(url: string): string {
  const withoutQuery = url.split(/[?#]/)[0] ?? url;
  const segment = withoutQuery.split('/').pop() ?? url;
  try {
    return decodeURIComponent(segment) || url;
  } catch {
    return segment || url;
  }
}

export function looksLikeImage(url: string): boolean {
  return /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(fileNameFromUrl(url));
}
