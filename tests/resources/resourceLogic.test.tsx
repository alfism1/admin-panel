import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { Action } from '@/core/actions/Action';
import type { ActionContext } from '@/core/actions/types';
import { apiClient } from '@/core/data/apiClient';
import type { RecordShape } from '@/core/data/types';
import { collectFields } from '@/core/forms/formState';
import type { Field } from '@/core/forms/Field';
import type { UpdateContext } from '@/core/forms/types';
import type { Column } from '@/core/tables/Column';
import type { TextColumnConfig } from '@/core/tables/columns/TextColumn';
import type { Resource } from '@/core/resources/types';
import { resources } from '@/resources';
import { makeFieldContext } from '../helpers/context';

/**
 * The inline closures a resource declares — auto-slug hooks, bulk-action
 * handlers, `formatStateUsing` renderers — are real application logic that no
 * structural test ever executes. These call them directly.
 */

const byName = Object.fromEntries(resources.map((resource) => [resource.name, resource])) as Record<
  string,
  Resource
>;

function field(resource: Resource, name: string): Field {
  const found = collectFields(resource.form ?? []).find((item) => item.name === name);
  if (!found) throw new Error(`No field "${name}" on ${resource.name}`);
  return found;
}

function column(resource: Resource, name: string): Column {
  const found = resource.table.columns.find((item) => item.name === name);
  if (!found) throw new Error(`No column "${name}" on ${resource.name}`);
  return found;
}

function action(resource: Resource, name: string): Action {
  const all = [...(resource.table.actions ?? []), ...(resource.table.bulkActions ?? [])];
  const found = all.find((item) => item.name === name);
  if (!found) throw new Error(`No action "${name}" on ${resource.name}`);
  return found;
}

/** Runs a field's `afterStateUpdated` and reports what it wrote. */
function runAfterUpdate(
  target: Field,
  state: unknown,
  operation: 'create' | 'edit' = 'create',
): Record<string, unknown> {
  const written: Record<string, unknown> = {};
  const hook = target.definition.afterStateUpdated;
  if (!hook) throw new Error(`Field "${target.name}" declares no afterStateUpdated`);

  const ctx = makeFieldContext({ operation, set: (path, value) => (written[path] = value) });
  hook({ ...ctx, state, oldState: '' } as unknown as UpdateContext<never>);

  return written;
}

function actionContext(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    record: null,
    records: [],
    data: {},
    refresh: vi.fn(),
    close: vi.fn(),
    notify: vi.fn(),
    navigate: vi.fn() as unknown as ActionContext['navigate'],
    ...overrides,
  };
}

let patch: MockInstance;
let post: MockInstance;

beforeEach(() => {
  patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: {} } as never);
  post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: {} } as never);
});

describe('auto-slug hooks', () => {
  it('slugifies a post title on create', () => {
    expect(runAfterUpdate(field(byName.posts, 'title'), 'Hello, World! 2024')).toEqual({
      slug: 'hello-world-2024',
    });
  });

  it('leaves an existing post slug alone on edit, since it is a permalink', () => {
    expect(runAfterUpdate(field(byName.posts, 'title'), 'Renamed', 'edit')).toEqual({});
  });

  it('strips leading and trailing separators', () => {
    expect(runAfterUpdate(field(byName.posts, 'title'), '  ...Hello...  ')).toEqual({
      slug: 'hello',
    });
  });

  it('collapses runs of punctuation into a single dash', () => {
    expect(runAfterUpdate(field(byName.posts, 'title'), 'A -- B__C')).toEqual({ slug: 'a-b-c' });
  });

  it('slugifies a role name', () => {
    expect(runAfterUpdate(field(byName.roles, 'name'), 'Content Editor')).toEqual({
      slug: 'content-editor',
    });
  });

  it('re-slugs a role on edit too', () => {
    expect(runAfterUpdate(field(byName.roles, 'name'), 'Renamed Role', 'edit')).toEqual({
      slug: 'renamed-role',
    });
  });

  it('re-slugs a product on edit, unlike a post', () => {
    expect(runAfterUpdate(field(byName.products, 'title'), 'Blue Widget', 'edit')).toEqual({
      slug: 'blue-widget',
    });
  });

  it('produces an empty slug from punctuation alone', () => {
    expect(runAfterUpdate(field(byName.posts, 'title'), '!!!')).toEqual({ slug: '' });
  });
});

describe('role permission summary', () => {
  const format = () => column(byName.roles, 'permissions').definition.formatState!;

  it('reports a granted count', () => {
    expect(format()(['user.view', 'post.view'], {})).toBe('2 granted');
  });

  it('recognises the global wildcard', () => {
    expect(format()(['*'], {})).toBe('All permissions');
  });

  it('reports zero for an empty list', () => {
    expect(format()([], {})).toBe('0 granted');
  });

  it('falls back to an em dash for a non-array value', () => {
    expect(format()(null, {})).toBe('—');
    expect(format()('nonsense', {})).toBe('—');
  });
});

describe('column descriptions', () => {
  it('renders the role description under the name', () => {
    // `description` lives on TextColumnConfig, not the erased base config.
    const config = column(byName.roles, 'name').definition as TextColumnConfig;
    const describe_ = config.description!;

    expect(describe_.resolve({ description: 'Can edit posts' })).toBe('Can edit posts');
    expect(describe_.resolve({})).toBe('');
  });
});

describe('bulk action handlers', () => {
  it('publishes every selected post', async () => {
    const records: RecordShape[] = [{ id: 1 }, { id: 2 }];

    await action(byName.posts, 'publish').definition.handler!(actionContext({ records }));

    expect(patch).toHaveBeenCalledTimes(2);
    expect(patch).toHaveBeenCalledWith(
      '/posts/1',
      expect.objectContaining({ status: 'published' }),
    );
  });

  it('stamps a publication timestamp', async () => {
    await action(byName.posts, 'publish').definition.handler!(
      actionContext({ records: [{ id: 1 }] }),
    );

    const [, body] = patch.mock.calls[0] as [string, { published_at: string }];
    expect(Date.parse(body.published_at)).not.toBeNaN();
  });

  it('activates every selected user', async () => {
    await action(byName.users, 'activate').definition.handler!(
      actionContext({ records: [{ id: 3 }, { id: 4 }] }),
    );

    expect(patch).toHaveBeenCalledWith('/users/3', { is_active: true });
    expect(patch).toHaveBeenCalledWith('/users/4', { is_active: true });
  });

  it('issues no request for an empty selection', async () => {
    await action(byName.users, 'activate').definition.handler!(actionContext({ records: [] }));

    expect(patch).not.toHaveBeenCalled();
  });

  it('rejects when one of the requests fails', async () => {
    patch.mockRejectedValueOnce(new Error('Conflict'));

    await expect(
      action(byName.posts, 'publish').definition.handler!(
        actionContext({ records: [{ id: 1 }, { id: 2 }] }),
      ),
    ).rejects.toThrow('Conflict');
  });
});

describe('reset password action', () => {
  it('posts the new password to the record endpoint', async () => {
    await action(byName.users, 'resetPassword').definition.handler!(
      actionContext({ record: { id: 7 }, data: { password: 'newsecret' } }),
    );

    expect(post).toHaveBeenCalledWith('/users/7/reset-password', { password: 'newsecret' });
  });

  it('carries a modal form schema', () => {
    expect(action(byName.users, 'resetPassword').definition.formSchema?.length).toBeGreaterThan(0);
  });
});

describe('post duplication', () => {
  const mutate = () => {
    const options = action(byName.posts, 'replicate').definition.replicate;
    if (!options?.mutate) throw new Error('The post replicate action declares no mutator');
    return options.mutate;
  };

  it('marks the copy as a draft with its own title and permalink', async () => {
    const replica = await mutate()(
      { title: 'Hello', slug: 'hello', status: 'published', is_featured: true },
      {},
    );

    expect(replica).toEqual({
      title: 'Hello (copy)',
      slug: 'hello-copy',
      status: 'draft',
      published_at: null,
      is_featured: false,
    });
  });

  it('never carries the view count or the embedded author over', () => {
    expect(action(byName.posts, 'replicate').definition.replicate?.exclude).toEqual([
      'views',
      'author',
    ]);
  });

  it('opens the copy for editing, since it still needs a title', () => {
    expect(action(byName.posts, 'replicate').definition.replicate?.redirect).toBe('edit');
  });
});

describe('custom cell components', () => {
  it('every column declaring a custom cell renders without throwing', () => {
    for (const resource of resources) {
      for (const col of resource.table.columns) {
        const Custom = col.definition.custom;
        if (!Custom) continue;
        expect(() =>
          render(<Custom config={col.definition} value={null} record={{}} />),
        ).not.toThrow();
      }
    }
  });
});
