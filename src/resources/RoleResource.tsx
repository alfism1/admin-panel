import { DeleteBulkAction } from '@/core/actions/BulkAction';
import { DeleteAction } from '@/core/actions/DeleteAction';
import { EditAction } from '@/core/actions/EditAction';
import { ViewAction } from '@/core/actions/ViewAction';
import { Select } from '@/core/forms/fields/Select';
import type { FieldControl } from '@/core/forms/types';
import { Textarea } from '@/core/forms/fields/Textarea';
import { TextInput } from '@/core/forms/fields/TextInput';
import { Section } from '@/core/forms/layouts/Section';
import { defineResource } from '@/core/resources/Resource';
import { DateColumn } from '@/core/tables/columns/DateColumn';
import { TextColumn } from '@/core/tables/columns/TextColumn';
import { PermissionMatrix } from './components/PermissionMatrix';

export const RoleResource = defineResource({
  name: 'roles',
  model: 'Role',
  route: '/roles',

  navigation: { label: 'Roles', icon: 'shield-check', group: 'User Management', sort: 2 },
  labels: { singular: 'Role', plural: 'Roles' },
  recordTitleKey: 'name',

  permissions: {
    viewAny: 'role.view',
    view: 'role.view',
    create: 'role.create',
    update: 'role.update',
    delete: 'role.delete',
  },

  form: [
    Section.make('Role')
      .columns(2)
      .schema([
        TextInput.make('name')
          .required()
          .maxLength(60)
          .autofocus()
          .live({ debounce: 200 })
          .afterStateUpdated(({ state, set }) =>
            set(
              'slug',
              state
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, ''),
            ),
          ),

        TextInput.make('slug')
          .required()
          .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and dashes only.')
          .helperText('Generated from the name, but you can override it.'),

        Textarea.make('description').rows(2).maxLength(160).columnSpanFull(),
      ]),

    Section.make('Permissions')
      .description('Tick a row or column header to select everything in it.')
      .schema([
        Select.make('permissions')
          .label('Granted permissions')
          .multiple()
          .default([])
          .customComponent(PermissionMatrix as FieldControl)
          .columnSpanFull(),
      ]),
  ],

  table: {
    columns: [
      TextColumn.make('name')
        .searchable()
        .sortable()
        .weight('semibold')
        .description((record) => String(record.description ?? '')),

      TextColumn.make('slug').badge('secondary').searchable(),

      TextColumn.make('permissions')
        .label('Permissions')
        .formatStateUsing((state) =>
          Array.isArray(state)
            ? state.includes('*')
              ? 'All permissions'
              : `${state.length} granted`
            : '—',
        ),

      TextColumn.make('users_count').label('Users').numeric().alignEnd().sortable(),

      DateColumn.make('created_at')
        .label('Created')
        .dateFormat('dd MMM yyyy')
        .sortable()
        .toggleable(),
    ],

    actions: [ViewAction.make(), EditAction.make(), DeleteAction.make()],
    bulkActions: [DeleteBulkAction.make()],

    defaultSort: { column: 'name', direction: 'asc' },
    defaultPerPage: 10,
    emptyState: {
      heading: 'No roles yet',
      icon: 'shield',
      description: 'Create a role to group permissions.',
    },
  },
});
