import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { apiClient } from '@/core/data/apiClient';
import type { SelectConfig, SelectValue } from '@/core/forms/fields/Select';
import type { FieldRenderProps, ResolvedFieldState } from '@/core/forms/types';
import { PermissionMatrix } from '@/resources/components/PermissionMatrix';
import { makeFieldContext } from '../helpers/context';
import { renderWithProviders } from '../helpers/render';
import { pending } from '../helpers/dataProvider';

const CATALOG = [
  'user.view',
  'user.create',
  'user.delete',
  'post.view',
  'post.create',
  'role.view',
];

let get: MockInstance;

beforeEach(() => {
  get = vi.spyOn(apiClient, 'get');
  get.mockResolvedValue({ data: { data: CATALOG } } as never);
});

function renderMatrix(value: SelectValue = [], stateOverrides: Partial<ResolvedFieldState> = {}) {
  const onChange = vi.fn();

  const state: ResolvedFieldState = {
    id: 'permissions',
    label: 'Permissions',
    hideLabel: false,
    required: false,
    disabled: false,
    readOnly: false,
    ...stateOverrides,
  };

  const props: FieldRenderProps<SelectValue, SelectConfig> = {
    name: 'permissions',
    config: { name: 'permissions', validation: {} },
    value,
    onChange,
    onBlur: vi.fn(),
    state,
    ctx: makeFieldContext(),
  };

  renderWithProviders(<PermissionMatrix {...props} />);
  return { onChange };
}

/** The emitted array, order-insensitive. */
const emitted = (onChange: ReturnType<typeof vi.fn>) =>
  [...(onChange.mock.calls.at(-1)?.[0] as string[])].sort();

describe('loading', () => {
  it('shows a skeleton while the catalog loads', () => {
    get.mockReturnValue(pending());

    const { container } = renderWithProviders(<div />);
    renderMatrix();

    expect(container.ownerDocument.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('fetches the permission catalog', async () => {
    renderMatrix();

    await waitFor(() => expect(get).toHaveBeenCalledWith('/permissions'));
  });
});

describe('grid layout', () => {
  it('renders a row per resource group', async () => {
    renderMatrix();

    expect(await screen.findByRole('button', { name: 'User' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Role' })).toBeInTheDocument();
  });

  it('renders a column per distinct action', async () => {
    renderMatrix();

    expect(await screen.findByRole('button', { name: 'View' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('renders a checkbox only where the permission exists', async () => {
    renderMatrix();

    expect(await screen.findByRole('checkbox', { name: 'user.delete' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'post.delete' })).not.toBeInTheDocument();
  });

  it('marks an unavailable combination with a dash', async () => {
    renderMatrix();
    await screen.findByRole('button', { name: 'Post' });

    expect(screen.getAllByText('–').length).toBeGreaterThan(0);
  });

  it('captions the table with the field label', async () => {
    renderMatrix();

    expect(await screen.findByText('Permissions')).toBeInTheDocument();
  });
});

describe('selection', () => {
  it('reflects the stored permissions', async () => {
    renderMatrix(['user.view', 'post.create']);

    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'user.view' })).toBeChecked());
    expect(screen.getByRole('checkbox', { name: 'post.create' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'user.create' })).not.toBeChecked();
  });

  it('adds a permission on check', async () => {
    const { onChange } = renderMatrix([]);

    await userEvent.click(await screen.findByRole('checkbox', { name: 'user.view' }));

    expect(emitted(onChange)).toEqual(['user.view']);
  });

  it('removes a permission on uncheck', async () => {
    const { onChange } = renderMatrix(['user.view', 'post.view']);

    await userEvent.click(await screen.findByRole('checkbox', { name: 'user.view' }));

    expect(emitted(onChange)).toEqual(['post.view']);
  });

  it('expands a stored wildcard so the grid shows what it grants', async () => {
    renderMatrix(['user.*']);

    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'user.view' })).toBeChecked());
    expect(screen.getByRole('checkbox', { name: 'user.create' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'user.delete' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'post.view' })).not.toBeChecked();
  });

  it('never emits a wildcard back, only concrete permissions', async () => {
    const { onChange } = renderMatrix(['user.*']);

    await userEvent.click(await screen.findByRole('checkbox', { name: 'post.view' }));

    expect(emitted(onChange)).toEqual(['post.view', 'user.create', 'user.delete', 'user.view']);
  });

  it('tolerates a non-array value', async () => {
    renderMatrix(null);

    expect(await screen.findByRole('checkbox', { name: 'user.view' })).not.toBeChecked();
  });
});

describe('bulk toggles', () => {
  it('grants every action in a row', async () => {
    const { onChange } = renderMatrix([]);

    await userEvent.click(await screen.findByRole('button', { name: 'User' }));

    expect(emitted(onChange)).toEqual(['user.create', 'user.delete', 'user.view']);
  });

  it('revokes a fully granted row', async () => {
    const { onChange } = renderMatrix(['user.view', 'user.create', 'user.delete', 'post.view']);

    await userEvent.click(await screen.findByRole('button', { name: 'User' }));

    expect(emitted(onChange)).toEqual(['post.view']);
  });

  it('grants a partially selected row rather than revoking it', async () => {
    const { onChange } = renderMatrix(['user.view']);

    await userEvent.click(await screen.findByRole('button', { name: 'User' }));

    expect(emitted(onChange)).toEqual(['user.create', 'user.delete', 'user.view']);
  });

  it('grants an action across every resource that has it', async () => {
    const { onChange } = renderMatrix([]);

    await userEvent.click(await screen.findByRole('button', { name: 'View' }));

    expect(emitted(onChange)).toEqual(['post.view', 'role.view', 'user.view']);
  });

  it('revokes an action granted everywhere', async () => {
    const { onChange } = renderMatrix(['user.view', 'post.view', 'role.view', 'user.create']);

    await userEvent.click(await screen.findByRole('button', { name: 'View' }));

    expect(emitted(onChange)).toEqual(['user.create']);
  });

  it('skips resources that do not have the action', async () => {
    const { onChange } = renderMatrix([]);

    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(emitted(onChange)).toEqual(['user.delete']);
  });
});

describe('super admin', () => {
  const superCheckbox = () =>
    within(screen.getByText('Super admin').closest('label')!).getByRole('checkbox');

  it('is unchecked by default', async () => {
    renderMatrix([]);
    await screen.findByRole('button', { name: 'User' });

    expect(superCheckbox()).not.toBeChecked();
  });

  it('is checked when the stored value is the global wildcard', async () => {
    renderMatrix(['*']);
    await screen.findByRole('button', { name: 'User' });

    expect(superCheckbox()).toBeChecked();
  });

  it('replaces the whole selection with the wildcard', async () => {
    const { onChange } = renderMatrix(['user.view']);
    await screen.findByRole('button', { name: 'User' });

    await userEvent.click(superCheckbox());

    expect(emitted(onChange)).toEqual(['*']);
  });

  it('clears everything when switched off', async () => {
    const { onChange } = renderMatrix(['*']);
    await screen.findByRole('button', { name: 'User' });

    await userEvent.click(superCheckbox());

    expect(emitted(onChange)).toEqual([]);
  });
});

describe('disabled state', () => {
  it('disables every checkbox', async () => {
    renderMatrix(['user.view'], { disabled: true });

    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'user.view' })).toBeDisabled());
  });
});
