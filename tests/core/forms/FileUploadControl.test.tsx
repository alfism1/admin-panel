import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/core/data/apiClient';
import { FileUpload } from '@/core/forms/fields/FileUpload';
import { SchemaForm } from '@/core/forms/SchemaForm';
import type { FormComponent, FormValues } from '@/core/forms/types';
import { renderWithProviders } from '../../helpers/render';

vi.mock('@/core/ui/notify', () => ({
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), show: vi.fn() },
}));

const { notify } = await import('@/core/ui/notify');

function renderField(schema: FormComponent[], record: FormValues | null = null) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);

  renderWithProviders(
    <SchemaForm
      schema={schema}
      operation={record ? 'edit' : 'create'}
      record={record}
      onSubmit={onSubmit}
    />,
  );

  return { onSubmit };
}

const submit = () => userEvent.click(screen.getByRole('button', { name: /Create|Save/ }));

function file(name: string, type = 'image/png', sizeKb = 1): File {
  const blob = new File([new Uint8Array(sizeKb * 1024)], name, { type });
  return blob;
}

/** The real input is `sr-only`; upload() targets it directly. */
const input = () => screen.getByLabelText(/Cover|Gallery|Docs/, { selector: 'input[type="file"]' });

const upload = vi.fn(async (picked: File) => `/uploads/${picked.name}`);

// `notify` is a module mock, so its spies survive `restoreMocks` — a test that
// asserts "no error was raised" needs a clean slate.
beforeEach(() => {
  vi.mocked(notify.error).mockClear();
});

const dropZone = () => screen.getByText(/Drop |Limit of /).closest('div') as HTMLElement;

/** A minimal `DataTransfer` — jsdom ships none, and only `files` is read. */
function transfer(files: unknown[]) {
  const list = { length: files.length, item: (index: number) => files[index] ?? null };
  files.forEach((entry, index) => Object.assign(list, { [index]: entry }));
  return { dataTransfer: { files: list } };
}

/** Resolves on demand, so two uploads can be interleaved deliberately. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('drop zone', () => {
  it('renders a browse affordance', () => {
    renderField([FileUpload.make('cover').uploadHandler(upload)]);

    expect(screen.getByRole('button', { name: 'browse' })).toBeInTheDocument();
    expect(screen.getByText(/Drop a file here/)).toBeInTheDocument();
  });

  it('says "an image" for an image-only field', () => {
    renderField([FileUpload.make('cover').image().uploadHandler(upload)]);

    expect(screen.getByText(/Drop an image here/)).toBeInTheDocument();
  });

  it('says "files" for a multiple field', () => {
    renderField([FileUpload.make('gallery').multiple().uploadHandler(upload)]);

    expect(screen.getByText(/Drop files here/)).toBeInTheDocument();
  });

  it('sets the accept attribute from imageOnly', () => {
    renderField([FileUpload.make('cover').image().uploadHandler(upload)]);

    expect(input()).toHaveAttribute('accept', 'image/*');
  });

  it('sets the accept attribute from an explicit list', () => {
    renderField([
      FileUpload.make('docs').acceptedFileTypes(['.pdf', '.docx']).uploadHandler(upload),
    ]);

    expect(input()).toHaveAttribute('accept', '.pdf,.docx');
  });

  it('marks the input multiple only when configured', () => {
    renderField([FileUpload.make('gallery').multiple().uploadHandler(upload)]);

    expect(input()).toHaveAttribute('multiple');
  });

  it('shows a constraint hint for size limits', () => {
    renderField([FileUpload.make('cover').maxSize(2048).minSize(10).uploadHandler(upload)]);

    expect(screen.getByText(/min 10 KB · max 2 MB/)).toBeInTheDocument();
  });

  it('shows a file-count hint when multiple with a cap', () => {
    renderField([FileUpload.make('gallery').maxFiles(3).uploadHandler(upload)]);

    expect(screen.getByText(/up to 3 files/)).toBeInTheDocument();
  });

  it('shows no hint when nothing is constrained', () => {
    renderField([FileUpload.make('cover').uploadHandler(upload)]);

    expect(screen.queryByText(/max /)).not.toBeInTheDocument();
  });

  it('disables the input when the field is disabled', () => {
    renderField([FileUpload.make('cover').disabled().uploadHandler(upload)]);

    expect(input()).toBeDisabled();
  });

  it('disables the input when the field is read-only', () => {
    renderField([FileUpload.make('cover').readOnly().uploadHandler(upload)]);

    expect(input()).toBeDisabled();
  });

  it('opens the file dialog from the browse button', async () => {
    renderField([FileUpload.make('cover').uploadHandler(upload)]);

    const click = vi.spyOn(input(), 'click');
    await userEvent.click(screen.getByRole('button', { name: 'browse' }));

    expect(click).toHaveBeenCalled();
  });

  it('disables the browse button while the field is disabled', () => {
    renderField([FileUpload.make('cover').disabled().uploadHandler(upload)]);

    expect(screen.getByRole('button', { name: 'browse' })).toBeDisabled();
  });

  it('marks the drop zone invalid when the field has an error', async () => {
    renderField([FileUpload.make('cover').required().uploadHandler(upload)]);

    await submit();

    await waitFor(() => expect(dropZone()).toHaveClass('border-destructive'));
  });
});

describe('drag and drop', () => {
  it('highlights the zone while a file is dragged over it', () => {
    renderField([FileUpload.make('cover').uploadHandler(upload)]);

    fireEvent.dragOver(dropZone());
    expect(dropZone()).toHaveClass('border-primary');

    fireEvent.dragLeave(dropZone());
    expect(dropZone()).not.toHaveClass('border-primary');
  });

  it('does not highlight a disabled zone', () => {
    renderField([FileUpload.make('cover').disabled().uploadHandler(upload)]);

    fireEvent.dragOver(dropZone());

    expect(dropZone()).not.toHaveClass('border-primary');
  });

  it('does not highlight a zone that is already full', () => {
    renderField([FileUpload.make('gallery').multiple().maxFiles(1).uploadHandler(upload)], {
      gallery: ['/uploads/a.png'],
    });

    fireEvent.dragOver(dropZone());

    expect(dropZone()).not.toHaveClass('border-primary');
  });

  it('uploads a dropped file', async () => {
    const handler = vi.fn(async (picked: File) => `/uploads/${picked.name}`);
    const { onSubmit } = renderField([FileUpload.make('cover').uploadHandler(handler)]);

    fireEvent.drop(dropZone(), transfer([file('dropped.png')]));

    await waitFor(() => expect(handler).toHaveBeenCalled());
    await submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ cover: '/uploads/dropped.png' }));
  });

  it('clears the highlight after a drop', async () => {
    renderField([FileUpload.make('cover').uploadHandler(upload)]);

    fireEvent.dragOver(dropZone());
    fireEvent.drop(dropZone(), transfer([file('dropped.png')]));

    await waitFor(() => expect(dropZone()).not.toHaveClass('border-primary'));
  });

  it('ignores a drop onto a disabled zone', async () => {
    const handler = vi.fn(async () => '/uploads/x.png');
    renderField([FileUpload.make('cover').disabled().uploadHandler(handler)]);

    fireEvent.drop(dropZone(), transfer([file('dropped.png')]));

    await waitFor(() => expect(dropZone()).not.toHaveClass('border-primary'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores a drop with an empty file list', async () => {
    const handler = vi.fn(async () => '/uploads/x.png');
    renderField([FileUpload.make('cover').uploadHandler(handler)]);

    fireEvent.drop(dropZone(), transfer([]));

    await waitFor(() => expect(handler).not.toHaveBeenCalled());
  });

  it('tolerates a drop whose entry cannot be read as a file', async () => {
    const handler = vi.fn(async () => '/uploads/x.png');
    renderField([FileUpload.make('cover').uploadHandler(handler)]);

    // A directory drop reports a length the browser cannot materialise into a
    // `File`; the control must not read `undefined` as something to upload.
    fireEvent.drop(dropZone(), transfer([undefined]));

    await waitFor(() => expect(handler).not.toHaveBeenCalled());
    expect(notify.error).not.toHaveBeenCalled();
  });

  it('refuses a drop once the file limit is reached', async () => {
    const handler = vi.fn(async () => '/uploads/x.png');
    renderField([FileUpload.make('gallery').multiple().maxFiles(1).uploadHandler(handler)], {
      gallery: ['/uploads/a.png'],
    });

    // The browse input is disabled at capacity, but a drop still reaches the zone.
    fireEvent.drop(dropZone(), transfer([file('b.png')]));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Remove a file first — at most 1 allowed.'),
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it('pluralises the remaining capacity', async () => {
    const handler = vi.fn(async (picked: File) => `/uploads/${picked.name}`);
    renderField([FileUpload.make('gallery').multiple().maxFiles(2).uploadHandler(handler)]);

    fireEvent.drop(dropZone(), transfer([file('a.png'), file('b.png'), file('c.png')]));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Only 2 more files can be added.'),
    );
  });
});

describe('uploading', () => {
  it('uploads a picked file and stores its url', async () => {
    const handler = vi.fn(async (picked: File) => `/uploads/${picked.name}`);
    const { onSubmit } = renderField([FileUpload.make('cover').uploadHandler(handler)]);

    await userEvent.upload(input(), file('photo.png'));

    await waitFor(() => expect(handler).toHaveBeenCalled());
    await submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ cover: '/uploads/photo.png' }));
  });

  it('passes the configured directory to the handler', async () => {
    const handler = vi.fn(async () => '/uploads/photo.png');
    renderField([FileUpload.make('cover').directory('covers').uploadHandler(handler)]);

    await userEvent.upload(input(), file('photo.png'));

    await waitFor(() => expect(handler).toHaveBeenCalledWith(expect.any(File), 'covers'));
  });

  it('appends to an array when multiple', async () => {
    const handler = vi.fn(async (picked: File) => `/uploads/${picked.name}`);
    const { onSubmit } = renderField(
      [FileUpload.make('gallery').multiple().uploadHandler(handler)],
      { gallery: ['/uploads/existing.png'] },
    );

    await userEvent.upload(input(), file('new.png'));

    await waitFor(() => expect(handler).toHaveBeenCalled());
    await submit();
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        gallery: ['/uploads/existing.png', '/uploads/new.png'],
      }),
    );
  });

  it('replaces the value for a single-file field', async () => {
    const handler = vi.fn(async (picked: File) => `/uploads/${picked.name}`);
    const { onSubmit } = renderField([FileUpload.make('cover').uploadHandler(handler)], {
      cover: '/uploads/old.png',
    });

    await userEvent.upload(input(), file('new.png'));

    await waitFor(() => expect(handler).toHaveBeenCalled());
    await submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ cover: '/uploads/new.png' }));
  });

  it('calls the delete handler for a replaced file', async () => {
    const remove = vi.fn(async () => undefined);
    renderField(
      [
        FileUpload.make('cover')
          .uploadHandler(async () => '/uploads/new.png')
          .deleteFileUsing(remove),
      ],
      { cover: '/uploads/old.png' },
    );

    await userEvent.upload(input(), file('new.png'));

    await waitFor(() => expect(remove).toHaveBeenCalledWith('/uploads/old.png'));
  });

  it('reports how many files failed', async () => {
    renderField([
      FileUpload.make('gallery')
        .multiple()
        .uploadHandler(async () => {
          throw new Error('Storage down');
        }),
    ]);

    await userEvent.upload(input(), file('a.png'));

    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('1 file failed to upload.'));
  });

  it('pluralises the failure count', async () => {
    renderField([
      FileUpload.make('gallery')
        .multiple()
        .uploadHandler(async () => {
          throw new Error('Storage down');
        }),
    ]);

    await userEvent.upload(input(), [file('a.png'), file('b.png')]);

    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('2 files failed to upload.'));
  });

  it('shows upload progress while files are in flight', async () => {
    const gate = deferred<string>();
    renderField([FileUpload.make('cover').uploadHandler(async () => gate.promise)]);

    await userEvent.upload(input(), file('slow.png'));

    expect(await screen.findByText('Uploading 1 of 1…')).toBeInTheDocument();
    expect(input()).toBeDisabled();

    gate.resolve('/uploads/slow.png');
    await waitFor(() => expect(screen.queryByText(/Uploading/)).not.toBeInTheDocument());
  });

  it('ignores a second drop while an upload is still in flight', async () => {
    const gate = deferred<string>();
    const handler = vi.fn(async () => gate.promise);
    renderField([FileUpload.make('gallery').multiple().uploadHandler(handler)]);

    const zone = dropZone();
    fireEvent.drop(zone, transfer([file('a.png')]));
    await waitFor(() => expect(handler).toHaveBeenCalledTimes(1));

    fireEvent.drop(zone, transfer([file('b.png')]));

    expect(handler).toHaveBeenCalledTimes(1);
    gate.resolve('/uploads/a.png');
    await waitFor(() => expect(screen.queryByText(/Uploading/)).not.toBeInTheDocument());
  });

  it('counts progress up as each file lands', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const handler = vi
      .fn<(picked: File) => Promise<string>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    renderField([FileUpload.make('gallery').multiple().uploadHandler(handler)]);

    await userEvent.upload(input(), [file('a.png'), file('b.png')]);

    expect(await screen.findByText('Uploading 1 of 2…')).toBeInTheDocument();

    first.resolve('/uploads/a.png');
    expect(await screen.findByText('Uploading 2 of 2…')).toBeInTheDocument();

    second.resolve('/uploads/b.png');
    await waitFor(() => expect(screen.queryByText(/Uploading/)).not.toBeInTheDocument());
  });

  it('posts to /uploads when no handler is configured', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue({ data: { url: '/uploads/photo.png' } });

    const { onSubmit } = renderField([FileUpload.make('cover').directory('covers')]);

    await userEvent.upload(input(), file('photo.png'));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/uploads', expect.any(FormData)));
    const body = post.mock.calls[0]?.[1] as FormData;
    expect(body.get('file')).toBeInstanceOf(File);
    expect(body.get('directory')).toBe('covers');

    await submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ cover: '/uploads/photo.png' }));
  });

  it('omits the directory when none is configured', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue({ data: { url: '/uploads/photo.png' } });

    renderField([FileUpload.make('cover')]);

    await userEvent.upload(input(), file('photo.png'));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect((post.mock.calls[0]?.[1] as FormData).get('directory')).toBeNull();
  });

  it('keeps the successful uploads when one of several fails', async () => {
    const handler = vi.fn(async (picked: File) => {
      if (picked.name === 'bad.png') throw new Error('nope');
      return `/uploads/${picked.name}`;
    });

    const { onSubmit } = renderField([
      FileUpload.make('gallery').multiple().uploadHandler(handler),
    ]);

    await userEvent.upload(input(), [file('good.png'), file('bad.png')]);

    await waitFor(() => expect(notify.error).toHaveBeenCalled());
    await submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ gallery: ['/uploads/good.png'] }));
  });
});

describe('client-side rejection', () => {
  it('rejects a file of the wrong type', async () => {
    const handler = vi.fn();
    renderField([FileUpload.make('docs').acceptedFileTypes(['.pdf']).uploadHandler(handler)]);

    // `applyAccept: false` so the browser-level filter does not swallow the file
    // first — the point is that the control rejects it and says why.
    await userEvent.upload(input(), file('photo.png', 'image/png'), { applyAccept: false });

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('"photo.png" is not an accepted file type.'),
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects a file over the size cap', async () => {
    const handler = vi.fn();
    renderField([FileUpload.make('cover').maxSize(1).uploadHandler(handler)]);

    await userEvent.upload(input(), file('big.png', 'image/png', 5));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('"big.png" is larger than 1 KB.'),
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects a file under the size floor', async () => {
    const handler = vi.fn();
    renderField([FileUpload.make('cover').minSize(100).uploadHandler(handler)]);

    await userEvent.upload(input(), file('tiny.png', 'image/png', 1));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('"tiny.png" is smaller than 100 KB.'),
    );
  });

  it('refuses files beyond the remaining capacity', async () => {
    const handler = vi.fn(async (picked: File) => `/uploads/${picked.name}`);
    renderField([FileUpload.make('gallery').maxFiles(2).uploadHandler(handler)], {
      gallery: ['/uploads/a.png'],
    });

    await userEvent.upload(input(), [file('b.png'), file('c.png')]);

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Only 1 more file can be added.'),
    );
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('disables the input at capacity', () => {
    renderField([FileUpload.make('gallery').maxFiles(1).multiple().uploadHandler(upload)], {
      gallery: ['/uploads/a.png'],
    });

    expect(screen.getByText('Limit of 1 files reached')).toBeInTheDocument();
    expect(input()).toBeDisabled();
  });
});

describe('file list', () => {
  it('renders nothing when empty', () => {
    renderField([FileUpload.make('cover').uploadHandler(upload)]);

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('renders a preview image for an image value', () => {
    renderField([FileUpload.make('cover').image().uploadHandler(upload)], {
      cover: '/uploads/photo.png',
    });

    expect(screen.getByRole('img', { name: 'photo.png' })).toHaveAttribute(
      'src',
      '/uploads/photo.png',
    );
  });

  it('renders a file name when previews are off', () => {
    renderField([FileUpload.make('cover').previewable(false).uploadHandler(upload)], {
      cover: '/uploads/report.pdf',
    });

    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('applies a configured preview height', () => {
    renderField([FileUpload.make('cover').image().imagePreviewHeight(200).uploadHandler(upload)], {
      cover: '/uploads/photo.png',
    });

    expect(screen.getByRole('img', { name: 'photo.png' })).toHaveStyle({ height: '200px' });
  });

  it('lists every file when multiple', () => {
    renderField([FileUpload.make('gallery').multiple().uploadHandler(upload)], {
      gallery: ['/uploads/a.png', '/uploads/b.png'],
    });

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('removes a file', async () => {
    const { onSubmit } = renderField(
      [FileUpload.make('gallery').multiple().uploadHandler(upload)],
      { gallery: ['/uploads/a.png', '/uploads/b.png'] },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Remove a.png' }));
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ gallery: ['/uploads/b.png'] }));
  });

  it('clears a single-file field to null on removal', async () => {
    const { onSubmit } = renderField([FileUpload.make('cover').uploadHandler(upload)], {
      cover: '/uploads/a.png',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Remove a.png' }));
    await submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ cover: null }));
  });

  it('calls the delete handler before removing', async () => {
    const remove = vi.fn(async () => undefined);
    renderField([FileUpload.make('cover').uploadHandler(upload).deleteFileUsing(remove)], {
      cover: '/uploads/a.png',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Remove a.png' }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith('/uploads/a.png'));
  });

  it('keeps the file when the delete handler fails', async () => {
    const remove = vi.fn(async () => {
      throw new Error('Storage down');
    });
    renderField([FileUpload.make('cover').uploadHandler(upload).deleteFileUsing(remove)], {
      cover: '/uploads/a.png',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Remove a.png' }));

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not remove the file. Please try again.'),
    );
    expect(screen.getByRole('img', { name: 'a.png' })).toBeInTheDocument();
  });

  it('offers no remove button when disabled', () => {
    renderField([FileUpload.make('cover').disabled().uploadHandler(upload)], {
      cover: '/uploads/a.png',
    });

    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
  });

  it('offers open and download links when enabled', () => {
    renderField([FileUpload.make('cover').openable().downloadable().uploadHandler(upload)], {
      cover: '/uploads/a.png',
    });

    expect(screen.getByRole('link', { name: 'Open a.png' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'Download a.png' })).toHaveAttribute(
      'download',
      'a.png',
    );
  });

  it('offers neither by default', () => {
    renderField([FileUpload.make('cover').uploadHandler(upload)], { cover: '/uploads/a.png' });

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('reordering', () => {
  const field = FileUpload.make('gallery').multiple().reorderable().uploadHandler(upload);
  const record = { gallery: ['/uploads/a.png', '/uploads/b.png', '/uploads/c.png'] };

  it('offers move controls', () => {
    renderField([field], record);

    expect(screen.getByRole('button', { name: 'Move b.png up' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move b.png down' })).toBeInTheDocument();
  });

  it('moves a file up', async () => {
    const { onSubmit } = renderField([field], record);

    await userEvent.click(screen.getByRole('button', { name: 'Move b.png up' }));
    await submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        gallery: ['/uploads/b.png', '/uploads/a.png', '/uploads/c.png'],
      }),
    );
  });

  it('moves a file down', async () => {
    const { onSubmit } = renderField([field], record);

    await userEvent.click(screen.getByRole('button', { name: 'Move b.png down' }));
    await submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        gallery: ['/uploads/a.png', '/uploads/c.png', '/uploads/b.png'],
      }),
    );
  });

  it('disables moving the first item up and the last down', () => {
    renderField([field], record);

    expect(screen.getByRole('button', { name: 'Move a.png up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move c.png down' })).toBeDisabled();
  });

  it('offers no reordering for a single file', () => {
    renderField([field], { gallery: ['/uploads/a.png'] });

    expect(screen.queryByRole('button', { name: /Move/ })).not.toBeInTheDocument();
  });

  it('offers no reordering when not configured', () => {
    renderField([FileUpload.make('gallery').multiple().uploadHandler(upload)], record);

    expect(screen.queryByRole('button', { name: /Move/ })).not.toBeInTheDocument();
  });
});

describe('avatar mode', () => {
  it('renders a single circular preview', () => {
    renderField([FileUpload.make('avatar').avatar().uploadHandler(upload)], {
      avatar: '/uploads/me.png',
    });

    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByRole('img', { name: 'me.png' })).toHaveClass('rounded-full');
  });
});
