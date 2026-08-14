import { Action } from '@/core/actions/Action';
import { BulkAction, DeleteBulkAction } from '@/core/actions/BulkAction';
import { DeleteAction } from '@/core/actions/DeleteAction';
import { EditAction } from '@/core/actions/EditAction';
import { ViewAction } from '@/core/actions/ViewAction';
import { apiClient } from '@/core/data/apiClient';
import { DatePicker } from '@/core/forms/fields/DatePicker';
import { FileUpload } from '@/core/forms/fields/FileUpload';
import { Select } from '@/core/forms/fields/Select';
import { Textarea } from '@/core/forms/fields/Textarea';
import { TextInput } from '@/core/forms/fields/TextInput';
import { Toggle } from '@/core/forms/fields/Toggle';
import { Section } from '@/core/forms/layouts/Section';
import { defineResource } from '@/core/resources/Resource';
import { BadgeColumn } from '@/core/tables/columns/BadgeColumn';
import { BooleanColumn } from '@/core/tables/columns/BooleanColumn';
import { DateColumn } from '@/core/tables/columns/DateColumn';
import { ImageColumn } from '@/core/tables/columns/ImageColumn';
import { TextColumn } from '@/core/tables/columns/TextColumn';
import { DateRangeFilter } from '@/core/tables/filters/DateRangeFilter';
import { SelectFilter } from '@/core/tables/filters/SelectFilter';
import { TernaryFilter } from '@/core/tables/filters/TernaryFilter';

export const UserResource = defineResource({
  name: 'users',
  model: 'User',
  route: '/users',

  navigation: { label: 'Users', icon: 'users', group: 'User Management', sort: 1 },
  labels: { singular: 'User', plural: 'Users' },
  recordTitleKey: 'name',

  permissions: {
    viewAny: 'user.view',
    view: 'user.view',
    create: 'user.create',
    update: 'user.update',
    delete: 'user.delete',
  },

  form: [
    Section.make('Account Details')
      .description('Basic information about the user')
      .columns(2)
      .schema([
        TextInput.make('name').required().maxLength(255).autofocus().placeholder('John Doe'),

        TextInput.make('email')
          .label('Email Address')
          .email()
          .required()
          .unique({ resource: 'users', ignoreRecord: true })
          .columnSpan(1),

        TextInput.make('password')
          .password()
          .revealable()
          .required((ctx) => ctx.operation === 'create')
          .minLength(8)
          .dehydrated((state) => Boolean(state))
          .helperText('Minimum 8 characters. Leave blank to keep the current password.'),

        Select.make('role_id')
          .label('Role')
          .relationship({ resource: 'roles', titleKey: 'name' })
          .searchable()
          .preload()
          .required(),

        Toggle.make('is_active')
          .label('Active')
          .default(true)
          .helperText('Inactive users cannot sign in.')
          .visible((ctx) => ctx.can('user.activate')),
      ]),

    Section.make('Profile')
      .collapsible()
      .collapsed()
      .columns(2)
      .schema([
        FileUpload.make('avatar').image().maxSize(2048).directory('avatars'),
        Textarea.make('bio').rows(4).maxLength(500).autosize().columnSpanFull(),
        DatePicker.make('joined_at')
          .maxDate(() => new Date())
          .displayFormat('dd MMM yyyy'),
      ]),
  ],

  table: {
    columns: [
      ImageColumn.make('avatar').circular().size(36).label(''),

      TextColumn.make('name')
        .searchable()
        .sortable()
        .weight('semibold')
        .description((record) => String(record.email ?? ''))
        .url((record) => `/users/${String(record.id)}`),

      BadgeColumn.make('role.name')
        .label('Role')
        .colors({ Admin: 'danger', Editor: 'warning', Viewer: 'gray' }),

      BooleanColumn.make('is_active').label('Active').sortable(),

      TextColumn.make('orders_count').label('Orders').numeric().alignEnd().sortable().toggleable(),

      DateColumn.make('created_at')
        .label('Registered')
        .since()
        .tooltip((record) => new Date(String(record.created_at)).toLocaleString())
        .sortable()
        .toggleable({ hiddenByDefault: true }),
    ],

    filters: [
      SelectFilter.make('role_id')
        .label('Role')
        .relationship({ resource: 'roles', titleKey: 'name' })
        .multiple(),
      TernaryFilter.make('is_active').label('Status').trueLabel('Active').falseLabel('Inactive'),
      DateRangeFilter.make('created_at').label('Registered'),
    ],

    actions: [
      ViewAction.make(),
      EditAction.make(),
      Action.make('resetPassword')
        .label('Reset Password')
        .icon('key')
        .color('warning')
        .iconOnly()
        .tooltip('Reset password')
        .authorize('user.update')
        .form([
          TextInput.make('password')
            .label('New password')
            .password()
            .revealable()
            .required()
            .minLength(8),
          TextInput.make('password_confirmation')
            .label('Confirm password')
            .password()
            .required()
            .confirmed(),
        ])
        .requiresConfirmation({ heading: 'Reset this user password?' })
        .action(async ({ record, data }) => {
          await apiClient.post(`/users/${String(record?.id)}/reset-password`, data);
        })
        .successNotification('Password has been reset.'),
      DeleteAction.make().requiresConfirmation(),
    ],

    bulkActions: [
      BulkAction.make('activate')
        .label('Activate selected')
        .icon('check-circle')
        .color('success')
        .authorize('user.update')
        .action(async ({ records }) => {
          await Promise.all(
            records.map((record) =>
              apiClient.patch(`/users/${String(record.id)}`, { is_active: true }),
            ),
          );
        })
        .successNotification('Selected users are now active.'),
      DeleteBulkAction.make(),
    ],

    defaultSort: { column: 'created_at', direction: 'desc' },
    perPageOptions: [10, 25, 50, 100],
    defaultPerPage: 25,
    striped: true,
    emptyState: {
      heading: 'No users yet',
      description: 'Invite your first teammate to get started.',
      icon: 'users',
    },
  },

  pages: { list: true, create: true, edit: true, view: true },
});
