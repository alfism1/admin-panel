import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TextInput } from '@/core/forms/fields/TextInput';
import { defineResource } from '@/core/resources/Resource';
import { registerResources } from '@/core/resources/registry';
import { Repeater } from '@/core/forms/fields/Repeater';
import { withRepeaterRelationships } from '@/resources/data/repeaterRelationships';
import { listResult, makeDataProvider, type MockDataProvider } from '../helpers/dataProvider';

/**
 * The decorator reads the schema off the registry, and `registerResources`
 * refuses duplicates — so each case gets a resource name of its own.
 */
let counter = 0;

function register(field: Repeater): string {
  counter += 1;
  const name = `articles${counter}`;
  registerResources([
    defineResource({
      name,
      model: 'Article',
      form: [TextInput.make('title'), field],
      table: { columns: [] },
    }),
  ]);
  return name;
}

const blocks = () =>
  Repeater.make('blocks')
    .relationship({ resource: 'post_blocks', foreignKey: 'post_id' })
    .schema([TextInput.make('body')]);

let base: MockDataProvider;

beforeEach(() => {
  base = makeDataProvider();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('hydrating', () => {
  it('loads the children onto the record it fetched', async () => {
    const name = register(blocks());
    base.getOne.mockResolvedValue({ id: 7, title: 'Hello' });
    base.getList.mockResolvedValue(listResult([{ id: 1, body: 'One', post_id: 7 }]));

    const record = await withRepeaterRelationships(base).getOne(name, 7);

    expect(record).toEqual({
      id: 7,
      title: 'Hello',
      blocks: [{ id: 1, body: 'One', post_id: 7 }],
    });
    expect(base.getList).toHaveBeenCalledWith('post_blocks', {
      page: 1,
      perPage: 100,
      sort: undefined,
      filters: { post_id: '7' },
    });
  });

  it('sorts by the order column when one is declared', async () => {
    const name = register(blocks().orderColumn('position'));
    base.getOne.mockResolvedValue({ id: 7 });

    await withRepeaterRelationships(base).getOne(name, 7);

    expect(base.getList).toHaveBeenCalledWith(
      'post_blocks',
      expect.objectContaining({ sort: { field: 'position', order: 'asc' } }),
    );
  });

  it('carries an explicit sort, page size and extra filters through', async () => {
    const name = register(
      Repeater.make('blocks')
        .relationship({
          resource: 'post_blocks',
          foreignKey: 'post_id',
          filters: { kind: 'quote' },
          sort: { field: 'id', order: 'desc' },
          perPage: 10,
        })
        .schema([TextInput.make('body')]),
    );
    base.getOne.mockResolvedValue({ id: 7 });

    await withRepeaterRelationships(base).getOne(name, 7);

    expect(base.getList).toHaveBeenCalledWith('post_blocks', {
      page: 1,
      perPage: 10,
      sort: { field: 'id', order: 'desc' },
      filters: { kind: 'quote', post_id: '7' },
    });
  });

  it('applies modifyRecordsUsing then the fill mutator', async () => {
    const name = register(
      blocks()
        .modifyRecordsUsing((records) => records.filter((row) => row.kind === 'quote'))
        .mutateRelationshipDataBeforeFillUsing((row) => ({ ...row, body: String(row.body ?? '') })),
    );
    base.getOne.mockResolvedValue({ id: 7 });
    base.getList.mockResolvedValue(
      listResult([
        { id: 1, kind: 'quote' },
        { id: 2, kind: 'code' },
      ]),
    );

    const record = await withRepeaterRelationships(base).getOne<{ blocks: unknown[] }>(name, 7);

    expect(record.blocks).toEqual([{ id: 1, kind: 'quote', body: '' }]);
  });

  it('leaves a resource with no relationship repeater untouched', async () => {
    const name = register(Repeater.make('faqs').schema([TextInput.make('question')]));
    base.getOne.mockResolvedValue({ id: 7 });

    const record = await withRepeaterRelationships(base).getOne(name, 7);

    expect(record).toEqual({ id: 7 });
    expect(base.getList).not.toHaveBeenCalled();
  });

  it('leaves a resource that is not registered untouched', async () => {
    base.getOne.mockResolvedValue({ id: 7 });

    await withRepeaterRelationships(base).getOne('nowhere', 7);

    expect(base.getList).not.toHaveBeenCalled();
  });

  it('leaves a registered resource with no form untouched', async () => {
    counter += 1;
    const name = `formless${counter}`;
    registerResources([defineResource({ name, model: 'Formless', table: { columns: [] } })]);
    base.getOne.mockResolvedValue({ id: 7 });

    await withRepeaterRelationships(base).getOne(name, 7);

    expect(base.getList).not.toHaveBeenCalled();
  });
});

describe('creating', () => {
  it('strips the array from the payload and inserts the children', async () => {
    const name = register(blocks());
    base.create.mockImplementation((resource: string, data: Record<string, unknown>) =>
      Promise.resolve(resource === name ? { id: 9, ...data } : { id: 100, ...data }),
    );

    await withRepeaterRelationships(base).create(name, {
      title: 'Hello',
      blocks: [{ body: 'One' }, { body: 'Two' }],
    });

    expect(base.create).toHaveBeenCalledWith(name, { title: 'Hello' });
    expect(base.create).toHaveBeenCalledWith('post_blocks', { body: 'One', post_id: 9 });
    expect(base.create).toHaveBeenCalledWith('post_blocks', { body: 'Two', post_id: 9 });
  });

  it('runs afterCreate on each inserted child', async () => {
    const afterCreate = vi.fn();
    const name = register(blocks().afterCreate(afterCreate));
    base.create.mockImplementation((_resource: string, data: Record<string, unknown>) =>
      Promise.resolve({ id: 9, ...data }),
    );

    await withRepeaterRelationships(base).create(name, { blocks: [{ body: 'One' }] });

    expect(afterCreate).toHaveBeenCalledWith({ id: 9, body: 'One', post_id: 9 });
  });

  it('applies the create mutator', async () => {
    const name = register(
      blocks().mutateRelationshipDataBeforeCreateUsing((data) => ({ ...data, kind: 'paragraph' })),
    );
    base.create.mockImplementation((_resource: string, data: Record<string, unknown>) =>
      Promise.resolve({ id: 9, ...data }),
    );

    await withRepeaterRelationships(base).create(name, { blocks: [{ body: 'One' }] });

    expect(base.create).toHaveBeenCalledWith('post_blocks', {
      body: 'One',
      post_id: 9,
      kind: 'paragraph',
    });
  });

  it('skips the sync entirely when the key is absent', async () => {
    const name = register(blocks());

    await withRepeaterRelationships(base).create(name, { title: 'Hello' });

    expect(base.create).toHaveBeenCalledTimes(1);
    expect(base.getList).not.toHaveBeenCalled();
  });

  it('treats a non-array value as no items', async () => {
    const name = register(blocks());
    base.create.mockResolvedValue({ id: 9 });

    await withRepeaterRelationships(base).create(name, { blocks: null });

    expect(base.create).toHaveBeenCalledTimes(1);
    expect(base.getList).toHaveBeenCalledOnce();
  });

  it('refuses to link children when the parent came back without an id', async () => {
    const name = register(blocks());
    base.create.mockResolvedValue({});

    await expect(
      withRepeaterRelationships(base).create(name, { blocks: [{ body: 'One' }] }),
    ).rejects.toThrow(/returned no id/);
  });
});

describe('updating', () => {
  const existing = [
    { id: 1, body: 'One', post_id: 7 },
    { id: 2, body: 'Two', post_id: 7 },
  ];

  beforeEach(() => {
    base.getList.mockResolvedValue(listResult(existing));
    base.update.mockImplementation((_resource: string, id: unknown, data: object) =>
      Promise.resolve({ id, ...data }),
    );
    base.create.mockImplementation((_resource: string, data: object) =>
      Promise.resolve({ id: 3, ...data }),
    );
  });

  it('updates known ids, inserts new items and deletes the rest', async () => {
    const name = register(blocks());

    await withRepeaterRelationships(base).update(name, 7, {
      title: 'Hi',
      blocks: [{ id: 1, body: 'One edited' }, { body: 'Three' }],
    });

    expect(base.update).toHaveBeenCalledWith(name, 7, { title: 'Hi' });
    expect(base.update).toHaveBeenCalledWith('post_blocks', 1, {
      body: 'One edited',
      post_id: 7,
    });
    expect(base.create).toHaveBeenCalledWith('post_blocks', { body: 'Three', post_id: 7 });
    expect(base.deleteMany).toHaveBeenCalledWith('post_blocks', [2]);
  });

  it('inserts an item whose id is not on file rather than updating a stranger', async () => {
    const name = register(blocks());

    await withRepeaterRelationships(base).update(name, 7, {
      blocks: [{ id: 99, body: 'Ghost' }],
    });

    expect(base.update).not.toHaveBeenCalledWith('post_blocks', 99, expect.anything());
    expect(base.create).toHaveBeenCalledWith('post_blocks', { body: 'Ghost', post_id: 7 });
  });

  it('runs the save mutator and afterUpdate', async () => {
    const afterUpdate = vi.fn();
    const name = register(
      blocks()
        .mutateRelationshipDataBeforeSaveUsing((data) => ({ ...data, kind: 'quote' }))
        .afterUpdate(afterUpdate),
    );

    await withRepeaterRelationships(base).update(name, 7, { blocks: [{ id: 1, body: 'One' }] });

    expect(base.update).toHaveBeenCalledWith('post_blocks', 1, {
      body: 'One',
      post_id: 7,
      kind: 'quote',
    });
    expect(afterUpdate).toHaveBeenCalledWith({ id: 1, body: 'One', post_id: 7, kind: 'quote' });
  });

  it('runs afterDelete for every removed row', async () => {
    const afterDelete = vi.fn();
    const name = register(blocks().afterDelete(afterDelete));

    await withRepeaterRelationships(base).update(name, 7, { blocks: [] });

    expect(base.deleteMany).toHaveBeenCalledWith('post_blocks', [1, 2]);
    expect(afterDelete).toHaveBeenCalledTimes(2);
    expect(afterDelete).toHaveBeenCalledWith(existing[0]);
  });

  it('deletes nothing when every row was kept', async () => {
    const name = register(blocks());

    await withRepeaterRelationships(base).update(name, 7, {
      blocks: [{ id: 1 }, { id: 2 }],
    });

    expect(base.deleteMany).not.toHaveBeenCalled();
  });

  it('carries the order column stamped by dehydrate into the child row', async () => {
    const field = register(blocks().orderColumn('position'));
    const repeater = blocks().orderColumn('position');
    const stamped = repeater.definition.dehydrateState?.([{ id: 1 }, { id: 2 }]);

    await withRepeaterRelationships(base).update(field, 7, { blocks: stamped });

    expect(base.update).toHaveBeenCalledWith('post_blocks', 1, { position: 0, post_id: 7 });
    expect(base.update).toHaveBeenCalledWith('post_blocks', 2, { position: 1, post_id: 7 });
  });
});

describe('deleting', () => {
  it('removes the children before the parent', async () => {
    const name = register(blocks());
    base.getList.mockResolvedValue(listResult([{ id: 1 }, { id: 2 }]));

    await withRepeaterRelationships(base).delete(name, 7);

    expect(base.getList).toHaveBeenCalledWith(
      'post_blocks',
      expect.objectContaining({
        filters: { post_id: '7' },
      }),
    );
    expect(base.deleteMany).toHaveBeenCalledWith('post_blocks', [1, 2]);
    expect(base.delete).toHaveBeenCalledWith(name, 7);
  });

  it('asks for every parent at once on a bulk delete', async () => {
    const name = register(blocks());
    base.getList.mockResolvedValue(listResult([{ id: 1 }]));

    await withRepeaterRelationships(base).deleteMany(name, [7, 8, 9]);

    expect(base.getList).toHaveBeenCalledWith(
      'post_blocks',
      expect.objectContaining({
        filters: { post_id: '7,8,9' },
      }),
    );
    expect(base.deleteMany).toHaveBeenCalledWith('post_blocks', [1]);
    expect(base.deleteMany).toHaveBeenCalledWith(name, [7, 8, 9]);
  });

  it('skips the child delete when there is nothing to remove', async () => {
    const name = register(blocks());

    await withRepeaterRelationships(base).deleteMany(name, [7]);

    expect(base.deleteMany).toHaveBeenCalledOnce();
    expect(base.deleteMany).toHaveBeenCalledWith(name, [7]);
  });
});

describe('untouched methods', () => {
  it('passes getList and getMany straight through', async () => {
    const provider = withRepeaterRelationships(base);

    await provider.getList('anything', { page: 1, perPage: 25 });
    await provider.getMany('anything', [1]);

    expect(base.getList).toHaveBeenCalledWith('anything', { page: 1, perPage: 25 });
    expect(base.getMany).toHaveBeenCalledWith('anything', [1]);
  });
});
