import { Trash2, Upload } from 'lucide-react';
import * as React from 'react';
import { apiClient } from '@/core/data/apiClient';
import { Spinner } from '@/core/ui/misc';
import { notify } from '@/core/ui/notify';
import { cn } from '@/lib/utils';
import type { FileUploadConfig, FileUploadValue } from '../fields/FileUpload';
import type { FieldRenderProps } from '../types';

async function defaultUpload(file: File, directory?: string): Promise<string> {
  const body = new FormData();
  body.append('file', file);
  if (directory) body.append('directory', directory);
  const { data } = await apiClient.post<{ url: string }>('/uploads', body);
  return data.url;
}

function toList(value: FileUploadValue): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function FileUploadControl({
  config,
  value,
  onChange,
  state,
}: FieldRenderProps<FileUploadValue, FileUploadConfig>) {
  const { imageOnly, multiple, maxSizeKb, acceptedFileTypes, directory, uploadHandler } = config;
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const files = toList(value);

  const accept = acceptedFileTypes?.join(',') ?? (imageOnly ? 'image/*' : undefined);

  const handleFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const chosen = multiple ? Array.from(list) : [list[0]];

    if (maxSizeKb) {
      const tooBig = chosen.find((file) => file.size / 1024 > maxSizeKb);
      if (tooBig) {
        notify.error(`"${tooBig.name}" exceeds the ${maxSizeKb} KB limit.`);
        return;
      }
    }

    setBusy(true);
    try {
      const upload = uploadHandler ?? defaultUpload;
      const urls = await Promise.all(chosen.map((file) => upload(file, directory)));
      onChange(multiple ? [...files, ...urls] : urls[0]);
    } catch {
      notify.error('Upload failed. Please try again.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = (url: string) => {
    const next = files.filter((item) => item !== url);
    onChange(multiple ? next : (next[0] ?? null));
  };

  const disabled = state.disabled || state.readOnly;

  return (
    <div className="space-y-2">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) void handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          'border-input bg-card flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors',
          dragging && 'border-primary bg-primary/5',
          disabled && 'opacity-60',
          state.error && 'border-destructive',
        )}
      >
        {busy ? (
          <Spinner className="size-5" />
        ) : (
          <Upload className="text-muted-foreground size-5" aria-hidden />
        )}
        <p className="text-muted-foreground text-sm">
          Drop {imageOnly ? 'an image' : 'a file'} here, or{' '}
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
            className="text-primary font-medium underline-offset-2 hover:underline"
          >
            browse
          </button>
        </p>
        {maxSizeKb ? (
          <p className="text-muted-foreground text-xs">Maximum {maxSizeKb} KB per file</p>
        ) : null}
        <input
          ref={inputRef}
          id={state.id}
          type="file"
          className="sr-only"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          aria-describedby={state.describedBy}
          onChange={(event) => void handleFiles(event.target.files)}
        />
      </div>

      {files.length > 0 ? (
        <ul className={cn('grid gap-2', imageOnly ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-1')}>
          {files.map((url) => (
            <li
              key={url}
              className="group border-border bg-card relative flex items-center gap-2 overflow-hidden rounded-md border p-1.5"
            >
              {imageOnly ? (
                <img src={url} alt="" className="aspect-square w-full rounded object-cover" />
              ) : (
                <span className="flex-1 truncate px-1 text-sm">{url.split('/').pop()}</span>
              )}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(url)}
                  aria-label="Remove file"
                  className="bg-background/90 text-destructive absolute top-1 right-1 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
