import { FileUploadControl } from '../controls/FileUploadControl';
import { Field, type FieldConfig } from '../Field';
import type { FieldControl, ValueType } from '../types';

export type UploadedFile = string;
export type FileUploadValue = UploadedFile | UploadedFile[] | null;

export type UploadHandler = (file: File, directory?: string) => Promise<string>;

export interface FileUploadConfig extends FieldConfig {
  imageOnly?: boolean;
  multiple?: boolean;
  /** Maximum size in kilobytes, matching Filament's unit. */
  maxSizeKb?: number;
  acceptedFileTypes?: string[];
  directory?: string;
  uploadHandler?: UploadHandler;
}

export class FileUpload extends Field<FileUploadValue, FileUploadConfig> {
  readonly valueType: ValueType = 'file';

  static make(name: string): FileUpload {
    return new FileUpload({ name, validation: {} });
  }

  get control(): FieldControl {
    return FileUploadControl as FieldControl;
  }

  image(value = true): this {
    return this.mutate({ imageOnly: value, acceptedFileTypes: this.config.acceptedFileTypes });
  }

  multiple(value = true): this {
    return this.mutate({ multiple: value });
  }

  maxSize(kilobytes: number): this {
    return this.mutate({ maxSizeKb: kilobytes });
  }

  acceptedFileTypes(types: string[]): this {
    return this.mutate({ acceptedFileTypes: types });
  }

  directory(path: string): this {
    return this.mutate({ directory: path });
  }

  /** Replaces the default `POST /uploads` multipart request. */
  uploadHandler(handler: UploadHandler): this {
    return this.mutate({ uploadHandler: handler });
  }
}
