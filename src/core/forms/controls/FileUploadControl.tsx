import { ArrowDown, ArrowUp, Download, ExternalLink, Trash2, Upload } from 'lucide-react';
import * as React from 'react';
import { apiClient } from '@/core/data/apiClient';
import { Spinner } from '@/core/ui/misc';
import { notify } from '@/core/ui/notify';
import { cn } from '@/lib/utils';
import type { FileUploadConfig } from '../fields/FileUpload';
import {
  acceptedTypesFor,
  effectiveLayout,
  fileNameFromUrl,
  formatFileSize,
  looksLikeImage,
  matchesAcceptedType,
  toFileList,
  type FileUploadValue,
} from '../fields/fileValue';
import type { FieldRenderProps } from '../types';

async function defaultUpload(file: File, directory?: string): Promise<string> {
  const body = new FormData();
  body.append('file', file);
  if (directory) body.append('directory', directory);
  const { data } = await apiClient.post<{ url: string }>('/uploads', body);
  return data.url;
}

/** Why a picked file cannot be uploaded, or `null` when it is acceptable. */
function rejectionFor(file: File, config: FileUploadConfig): string | null {
  if (!matchesAcceptedType(file, config)) {
    return `"${file.name}" is not an accepted file type.`;
  }
  const kilobytes = file.size / 1024;
  if (config.maxSizeKb !== undefined && kilobytes > config.maxSizeKb) {
    return `"${file.name}" is larger than ${formatFileSize(config.maxSizeKb)}.`;
  }
  if (config.minSizeKb !== undefined && kilobytes < config.minSizeKb) {
    return `"${file.name}" is smaller than ${formatFileSize(config.minSizeKb)}.`;
  }
  return null;
}

function constraintHint(config: FileUploadConfig): string | null {
  const parts: string[] = [];
  const accepted = acceptedTypesFor(config);
  if (accepted?.length && !(accepted.length === 1 && accepted[0] === 'image/*')) {
    parts.push(accepted.join(', '));
  }
  if (config.minSizeKb !== undefined) parts.push(`min ${formatFileSize(config.minSizeKb)}`);
  if (config.maxSizeKb !== undefined) parts.push(`max ${formatFileSize(config.maxSizeKb)}`);
  if (config.multiple && config.maxFiles !== undefined)
    parts.push(`up to ${config.maxFiles} files`);
  return parts.length ? parts.join(' · ') : null;
}

export function FileUploadControl({
  config,
  value,
  onChange,
  onBlur,
  state,
}: FieldRenderProps<FileUploadValue, FileUploadConfig>) {
  const {
    imageOnly,
    isAvatar,
    multiple,
    maxFiles,
    directory,
    uploadHandler,
    deleteHandler,
    reorderable,
    downloadable,
    openable,
    previewable,
    imagePreviewHeight,
  } = config;

  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const files = toFileList(value);
  const busy = progress !== null;
  const disabled = state.disabled || state.readOnly;
  const layout = effectiveLayout(config);
  const atCapacity = multiple ? maxFiles !== undefined && files.length >= maxFiles : false;

  const commit = (next: string[]) => onChange(multiple ? next : (next[0] ?? null));

  const clearInput = () => {
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFiles = async (list: FileList | null) => {
    if (!list?.length || disabled || busy) return;

    const picked = multiple ? Array.from(list) : list[0] ? [list[0]] : [];
    const problems: string[] = [];
    let queue: File[] = [];

    for (const file of picked) {
      const reason = rejectionFor(file, config);
      if (reason) problems.push(reason);
      else queue.push(file);
    }

    if (multiple && maxFiles !== undefined) {
      const room = Math.max(0, maxFiles - files.length);
      if (queue.length > room) {
        problems.push(
          room === 0
            ? `Remove a file first — at most ${maxFiles} allowed.`
            : `Only ${room} more ${room === 1 ? 'file' : 'files'} can be added.`,
        );
        queue = queue.slice(0, room);
      }
    }

    for (const problem of problems) notify.error(problem);
    if (!queue.length) {
      clearInput();
      return;
    }

    const upload = uploadHandler ?? defaultUpload;
    const replaced = multiple ? null : files[0];

    setProgress({ done: 0, total: queue.length });
    // `allSettled`, not `all`: one bad file must not discard the uploads that
    // already succeeded alongside it.
    const results = await Promise.allSettled(
      queue.map((file) =>
        upload(file, directory).finally(() =>
          // Defensive: `busy` serialises batches, so the counter is always
          // still up when a file lands.
          /* v8 ignore next */
          setProgress((current) => (current ? { ...current, done: current.done + 1 } : current)),
        ),
      ),
    );
    setProgress(null);
    clearInput();

    const uploaded = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    const failed = results.length - uploaded.length;
    if (failed > 0) {
      notify.error(`${failed} ${failed === 1 ? 'file' : 'files'} failed to upload.`);
    }
    if (!uploaded.length) return;

    commit(multiple ? [...files, ...uploaded] : uploaded.slice(0, 1));
    onBlur();

    if (replaced && deleteHandler) {
      void deleteHandler(replaced).catch(() => undefined);
    }
  };

  const removeAt = async (index: number) => {
    const url = files[index];
    // Defensive: the index comes from the same render that produced `files`.
    /* v8 ignore next */
    if (url === undefined) return;

    if (deleteHandler) {
      try {
        await deleteHandler(url);
      } catch {
        notify.error('Could not remove the file. Please try again.');
        return;
      }
    }

    commit(files.filter((_, position) => position !== index));
    onBlur();
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    // Defensive: the buttons at either end of the list are disabled.
    /* v8 ignore next */
    if (target < 0 || target >= files.length) return;
    const next = [...files];
    const [item] = next.splice(index, 1);
    if (item !== undefined) next.splice(target, 0, item);
    commit(next);
  };

  const accept = acceptedTypesFor(config)?.join(',');
  const hint = constraintHint(config);
  const canReorder = Boolean(multiple && reorderable) && files.length > 1 && !disabled;

  return (
    <div className="space-y-2">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !busy && !atCapacity) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled && !busy) void handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          'border-input bg-card flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors',
          dragging && 'border-primary bg-primary/5',
          (disabled || atCapacity) && 'opacity-60',
          state.error && 'border-destructive',
        )}
      >
        {busy ? (
          <Spinner className="size-5" />
        ) : (
          <Upload className="text-muted-foreground size-5" aria-hidden />
        )}

        <p className="text-muted-foreground text-sm" aria-live="polite">
          {busy ? (
            `Uploading ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
          ) : atCapacity ? (
            `Limit of ${maxFiles} files reached`
          ) : (
            <>
              Drop {multiple ? 'files' : imageOnly ? 'an image' : 'a file'} here, or{' '}
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => inputRef.current?.click()}
                className="text-primary font-medium underline-offset-2 hover:underline disabled:no-underline"
              >
                browse
              </button>
            </>
          )}
        </p>

        {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}

        <input
          ref={inputRef}
          id={state.id}
          type="file"
          className="sr-only"
          accept={accept}
          multiple={multiple}
          disabled={disabled || busy || atCapacity}
          aria-describedby={state.describedBy}
          aria-invalid={Boolean(state.error)}
          onChange={(event) => void handleFiles(event.target.files)}
        />
      </div>

      {files.length > 0 ? (
        <ul
          className={cn(
            'grid gap-2',
            layout === 'grid' && !isAvatar && 'grid-cols-3 sm:grid-cols-4',
            (layout === 'list' || isAvatar) && 'grid-cols-1',
          )}
        >
          {files.map((url, index) => {
            const name = fileNameFromUrl(url);
            const preview = previewable !== false && (imageOnly || looksLikeImage(url));

            return (
              <li
                key={`${url}#${index}`}
                className={cn(
                  'group border-border bg-card relative flex items-center gap-2 overflow-hidden rounded-md border p-1.5',
                  isAvatar && 'w-fit rounded-full border-none p-0',
                )}
              >
                {preview ? (
                  <img
                    src={url}
                    alt={name}
                    loading="lazy"
                    style={imagePreviewHeight ? { height: imagePreviewHeight } : undefined}
                    className={cn(
                      'w-full rounded object-cover',
                      isAvatar && 'size-20 rounded-full',
                      !imagePreviewHeight && !isAvatar && 'aspect-square',
                    )}
                  />
                ) : (
                  <span className="flex-1 truncate px-1 text-sm" title={name}>
                    {name}
                  </span>
                )}

                <div
                  className={cn(
                    'absolute top-1 right-1 flex items-center gap-0.5',
                    preview && !isAvatar
                      ? 'opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100'
                      : null,
                    isAvatar && 'top-0 right-0',
                  )}
                >
                  {canReorder ? (
                    <>
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${name} up`}
                        className="bg-background/90 text-muted-foreground hover:text-foreground rounded p-1 disabled:opacity-40"
                      >
                        <ArrowUp className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === files.length - 1}
                        aria-label={`Move ${name} down`}
                        className="bg-background/90 text-muted-foreground hover:text-foreground rounded p-1 disabled:opacity-40"
                      >
                        <ArrowDown className="size-3.5" />
                      </button>
                    </>
                  ) : null}

                  {openable ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${name}`}
                      className="bg-background/90 text-muted-foreground hover:text-foreground rounded p-1"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : null}

                  {downloadable ? (
                    <a
                      href={url}
                      download={name}
                      aria-label={`Download ${name}`}
                      className="bg-background/90 text-muted-foreground hover:text-foreground rounded p-1"
                    >
                      <Download className="size-3.5" />
                    </a>
                  ) : null}

                  {!disabled ? (
                    <button
                      type="button"
                      onClick={() => void removeAt(index)}
                      aria-label={`Remove ${name}`}
                      className="bg-background/90 text-destructive rounded p-1"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
