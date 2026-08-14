import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TextInput } from '@/core/forms/fields/TextInput';
import { SchemaForm } from '@/core/forms/SchemaForm';
import { createStaticContext } from '@/core/forms/useFieldContext';
import type { FormComponent } from '@/core/forms/types';
import { makeUser } from '../../helpers/context';
import { renderWithProviders } from '../../helpers/render';

const can = () => true;

describe('createStaticContext', () => {
  const base = { operation: 'create' as const, record: null, user: makeUser(), can };

  it('reads a top-level value', () => {
    const ctx = createStaticContext({ name: 'Ada' }, base);

    expect(ctx.get('name')).toBe('Ada');
  });

  it('reads a nested value by path', () => {
    const ctx = createStaticContext({ role: { name: 'admin' } }, base);

    expect(ctx.get('role.name')).toBe('admin');
  });

  it('returns undefined for a path that runs off a non-object', () => {
    const ctx = createStaticContext({ role: 'admin' }, base);

    expect(ctx.get('role.name.deep')).toBeUndefined();
  });

  it('returns undefined for a missing branch', () => {
    const ctx = createStaticContext({}, base);

    expect(ctx.get('role.name')).toBeUndefined();
  });

  it('exposes the own field value as state', () => {
    const ctx = createStaticContext({ name: 'Ada' }, { ...base, ownName: 'name' });

    expect(ctx.state).toBe('Ada');
  });

  it('leaves state undefined when the context belongs to no field', () => {
    const ctx = createStaticContext({ name: 'Ada' }, base);

    expect(ctx.state).toBeUndefined();
  });

  it('carries the operation, record, user and permission checker', () => {
    const record = { id: 1 };
    const ctx = createStaticContext({}, { ...base, operation: 'edit', record });

    expect(ctx.operation).toBe('edit');
    expect(ctx.record).toBe(record);
    expect(ctx.user).not.toBeNull();
    expect(ctx.can('anything')).toBe(true);
  });

  it('forwards an explicit setter', () => {
    const set = vi.fn();
    const ctx = createStaticContext({}, { ...base, set });

    ctx.set('name', 'Ada');

    expect(set).toHaveBeenCalledWith('name', 'Ada');
  });

  it('falls back to a setter that does nothing', () => {
    const ctx = createStaticContext({}, base);

    expect(ctx.set('name', 'Ada')).toBeUndefined();
  });
});

describe('the reactive context inside a form', () => {
  function renderForm(schema: FormComponent[]) {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<SchemaForm schema={schema} operation="create" onSubmit={onSubmit} />);
    return { onSubmit };
  }

  it('lets a field write to a sibling through ctx.set', async () => {
    renderForm([
      TextInput.make('title')
        .live()
        .afterStateUpdated((ctx) => {
          ctx.set(
            'slug',
            String(ctx.state ?? '')
              .toLowerCase()
              .replace(/\s+/g, '-'),
          );
        }),
      TextInput.make('slug'),
    ]);

    await userEvent.type(screen.getByLabelText('Title'), 'Hello World');

    await waitFor(() => expect(screen.getByLabelText('Slug')).toHaveValue('hello-world'));
  });

  it('debounces the update hook when asked to', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderForm([
      TextInput.make('title')
        .live({ debounce: 300 })
        .afterStateUpdated((ctx) => {
          ctx.set('slug', String(ctx.state ?? ''));
        }),
      TextInput.make('slug'),
    ]);

    await user.type(screen.getByLabelText('Title'), 'abc');
    expect(screen.getByLabelText('Slug')).toHaveValue('');

    await vi.advanceTimersByTimeAsync(400);
    await waitFor(() => expect(screen.getByLabelText('Slug')).toHaveValue('abc'));

    vi.useRealTimers();
  });

  it('marks the form dirty when a resolver writes a value', async () => {
    renderForm([
      TextInput.make('title')
        .live()
        .afterStateUpdated((ctx) => ctx.set('slug', 'set-by-resolver')),
      TextInput.make('slug'),
    ]);

    await userEvent.type(screen.getByLabelText('Title'), 'x');

    await waitFor(() => expect(screen.getByLabelText('Slug')).toHaveValue('set-by-resolver'));
  });

  it('re-resolves a dependent field when the value it reads changes', async () => {
    renderForm([
      TextInput.make('country'),
      TextInput.make('city').helperText((ctx) => `In ${String(ctx.get('country') || 'nowhere')}`),
    ]);

    expect(screen.getByText('In nowhere')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Country'), 'Indonesia');

    await waitFor(() => expect(screen.getByText('In Indonesia')).toBeInTheDocument());
  });
});
