import { describe, expect, it } from 'vitest';
import { FileUpload } from '@/core/forms/fields/FileUpload';
import { makeFieldContext } from '../../helpers/context';

const ctx = makeFieldContext();

describe('FileUpload shape', () => {
  it('is a file field', () => {
    expect(FileUpload.make('cover').valueType).toBe('file');
  });

  it('stores intake options', () => {
    const field = FileUpload.make('docs')
      .image()
      .multiple()
      .acceptedFileTypes(['.pdf'])
      .directory('uploads/docs');

    expect(field.definition).toMatchObject({
      imageOnly: true,
      multiple: true,
      acceptedFileTypes: ['.pdf'],
      directory: 'uploads/docs',
    });
  });

  it('stores size boundaries', () => {
    const field = FileUpload.make('cover').maxSize(2048).minSize(10);
    expect(field.definition.maxSizeKb).toBe(2048);
    expect(field.definition.minSizeKb).toBe(10);
  });

  it('stores panel options', () => {
    const field = FileUpload.make('cover')
      .reorderable()
      .downloadable()
      .openable()
      .previewable(false)
      .imagePreviewHeight(180)
      .panelLayout('list');

    expect(field.definition).toMatchObject({
      reorderable: true,
      downloadable: true,
      openable: true,
      previewable: false,
      imagePreviewHeight: 180,
      panelLayout: 'list',
    });
  });

  it('stores upload and delete handlers', () => {
    const upload = async () => '/a.png';
    const remove = async () => undefined;
    const field = FileUpload.make('cover').uploadHandler(upload).deleteFileUsing(remove);

    expect(field.definition.uploadHandler).toBe(upload);
    expect(field.definition.deleteHandler).toBe(remove);
  });
});

describe('avatar()', () => {
  it('forces a single image', () => {
    const field = FileUpload.make('avatar').multiple().avatar();

    expect(field.definition).toMatchObject({
      isAvatar: true,
      imageOnly: true,
      multiple: false,
      maxFiles: 1,
    });
  });

  it('avatar(false) restores the prior multiple setting', () => {
    const field = FileUpload.make('gallery').multiple().avatar(false);
    expect(field.definition.isAvatar).toBe(false);
    expect(field.definition.multiple).toBe(true);
  });
});

describe('file-count boundaries', () => {
  it('maxFiles above one implies multiple', () => {
    expect(FileUpload.make('g').maxFiles(3).definition).toMatchObject({
      maxFiles: 3,
      multiple: true,
    });
  });

  it('maxFiles(1) does not imply multiple', () => {
    expect(FileUpload.make('g').maxFiles(1).definition.multiple).toBeFalsy();
  });

  it('a positive minFiles also makes the field required', () => {
    const field = FileUpload.make('g').minFiles(2);
    expect(field.definition.minFiles).toBe(2);
    expect(field.definition.validation.required).toBe(true);
  });

  it('minFiles(0) leaves the field optional', () => {
    const field = FileUpload.make('g').minFiles(0);
    expect(field.definition.minFiles).toBe(0);
    expect(field.definition.validation.required).toBeUndefined();
  });
});

describe('FileUpload.validate', () => {
  it('accepts a value with no count limits', () => {
    expect(FileUpload.make('g').validate(['/a.png', '/b.png'], ctx, 'Gallery')).toEqual([]);
  });

  it('reports too many files, pluralising correctly', () => {
    expect(FileUpload.make('g').maxFiles(2).validate(['/a', '/b', '/c'], ctx, 'Gallery')).toEqual([
      'Gallery accepts at most 2 files.',
    ]);
  });

  it('uses the singular for a limit of one', () => {
    expect(FileUpload.make('g').maxFiles(1).validate(['/a', '/b'], ctx, 'Cover')).toEqual([
      'Cover accepts at most 1 file.',
    ]);
  });

  it('reports too few files', () => {
    expect(FileUpload.make('g').minFiles(2).validate(['/a'], ctx, 'Gallery')).toEqual([
      'Gallery needs at least 2 files.',
    ]);
  });

  it('counts a bare string as one file', () => {
    expect(FileUpload.make('g').minFiles(1).validate('/a.png', ctx, 'Cover')).toEqual([]);
  });

  it('counts null as zero files', () => {
    expect(FileUpload.make('g').minFiles(1).validate(null, ctx, 'Cover')).toEqual([
      'Cover needs at least 1 file.',
    ]);
  });

  it('can report both bounds at once', () => {
    const field = FileUpload.make('g').maxFiles(1).minFiles(3);
    expect(field.validate(['/a', '/b'], ctx, 'Gallery')).toHaveLength(2);
  });
});
