import { FileUploadControl } from '../controls/FileUploadControl';
import { Field, type FieldConfig } from '../Field';
import type { FieldContext, FieldControl, ValueType } from '../types';
import {
  toFileList,
  type FileConstraintConfig,
  type FileUploadValue,
  type PanelLayout,
} from './fileValue';

export type { FileUploadValue, PanelLayout, UploadedFile } from './fileValue';

export type UploadHandler = (file: File, directory?: string) => Promise<string>;
/** Called when a file is removed from the field, before the form is saved. */
export type DeleteHandler = (url: string) => Promise<void>;

export interface FileUploadConfig extends FieldConfig, FileConstraintConfig {
  multiple?: boolean;
  isAvatar?: boolean;
  /** Sizes are in kilobytes, matching Filament's unit. */
  maxSizeKb?: number;
  minSizeKb?: number;
  maxFiles?: number;
  minFiles?: number;
  directory?: string;
  uploadHandler?: UploadHandler;
  deleteHandler?: DeleteHandler;
  reorderable?: boolean;
  downloadable?: boolean;
  openable?: boolean;
  imagePreviewHeight?: number;
}

export class FileUpload extends Field<FileUploadValue, FileUploadConfig> {
  readonly valueType: ValueType = 'file';

  static make(name: string): FileUpload {
    return new FileUpload({ name, validation: {} });
  }

  get control(): FieldControl {
    return FileUploadControl as FieldControl;
  }

  // ------------------------------------------------------------------ intake

  image(value = true): this {
    return this.mutate({ imageOnly: value });
  }

  /** A single, circular image preview — Filament's `->avatar()`. */
  avatar(value = true): this {
    return this.mutate({
      isAvatar: value,
      imageOnly: value || this.config.imageOnly,
      multiple: value ? false : this.config.multiple,
      maxFiles: value ? 1 : this.config.maxFiles,
    });
  }

  multiple(value = true): this {
    return this.mutate({ multiple: value });
  }

  acceptedFileTypes(types: string[]): this {
    return this.mutate({ acceptedFileTypes: types });
  }

  directory(path: string): this {
    return this.mutate({ directory: path });
  }

  // -------------------------------------------------------------- boundaries

  maxSize(kilobytes: number): this {
    return this.mutate({ maxSizeKb: kilobytes });
  }

  minSize(kilobytes: number): this {
    return this.mutate({ minSizeKb: kilobytes });
  }

  maxFiles(count: number): this {
    return this.mutate({ maxFiles: count, multiple: count > 1 || this.config.multiple });
  }

  /** A positive minimum also makes the field required — zero files cannot satisfy it. */
  minFiles(count: number): this {
    const next = this.mutate({ minFiles: count });
    return count > 0 ? next.required() : next;
  }

  // ------------------------------------------------------------------ panels

  reorderable(value = true): this {
    return this.mutate({ reorderable: value });
  }

  downloadable(value = true): this {
    return this.mutate({ downloadable: value });
  }

  openable(value = true): this {
    return this.mutate({ openable: value });
  }

  /** Turn off to list file names instead of rendering thumbnails. */
  previewable(value = true): this {
    return this.mutate({ previewable: value });
  }

  imagePreviewHeight(pixels: number): this {
    return this.mutate({ imagePreviewHeight: pixels });
  }

  panelLayout(layout: PanelLayout): this {
    return this.mutate({ panelLayout: layout });
  }

  // ---------------------------------------------------------------- handlers

  /** Replaces the default `POST /uploads` multipart request. */
  uploadHandler(handler: UploadHandler): this {
    return this.mutate({ uploadHandler: handler });
  }

  /** Runs when a file is removed, so orphans can be cleaned from storage. */
  deleteFileUsing(handler: DeleteHandler): this {
    return this.mutate({ deleteHandler: handler });
  }

  // -------------------------------------------------------------- validation

  validate(value: unknown, _ctx: FieldContext, label: string): string[] {
    const files = toFileList(value as FileUploadValue);
    const { minFiles, maxFiles } = this.config;
    const issues: string[] = [];

    if (maxFiles !== undefined && files.length > maxFiles) {
      issues.push(`${label} accepts at most ${maxFiles} ${maxFiles === 1 ? 'file' : 'files'}.`);
    }
    if (minFiles !== undefined && files.length < minFiles) {
      issues.push(`${label} needs at least ${minFiles} ${minFiles === 1 ? 'file' : 'files'}.`);
    }

    return issues;
  }
}
