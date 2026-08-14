import { DeleteBulkAction } from '@/core/actions/BulkAction';
import { DeleteAction } from '@/core/actions/DeleteAction';
import { EditAction } from '@/core/actions/EditAction';
import { ViewAction } from '@/core/actions/ViewAction';
import { Select } from '@/core/forms/fields/Select';
import { TextInput } from '@/core/forms/fields/TextInput';
import { Toggle } from '@/core/forms/fields/Toggle';
import { Section } from '@/core/forms/layouts/Section';
import { defineResource } from '@/core/resources/Resource';
import { BooleanColumn } from '@/core/tables/columns/BooleanColumn';
import { DateColumn } from '@/core/tables/columns/DateColumn';
import { TextColumn } from '@/core/tables/columns/TextColumn';
import { TernaryFilter } from '@/core/tables/filters/TernaryFilter';

export const ProductResource = defineResource({
  name: 'products',
  model: 'Product',
  route: '/products',

  navigation: { label: 'Products', icon: 'circle-dot', sort: 10 },
  labels: { singular: 'Product', plural: 'Products' },
  recordTitleKey: 'name',

  permissions: {
    viewAny: 'product.view',
    view: 'product.view',
    create: 'product.create',
    update: 'product.update',
    delete: 'product.delete',
  },

  form: [
    Section.make('Details')
      .columns(2)
      .schema([
        TextInput.make('title')
          .required()
          .maxLength(255)
          .autofocus()
          .live({ debounce: 250 })
          .afterStateUpdated(({ state, set, operation }) => {
            // Only auto-slug while drafting; an existing slug is a permalink.
            if (operation === 'create' || operation === 'edit') {
              set(
                'slug',
                state
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-|-$/g, ''),
              );
            }
          }),
        TextInput.make('slug')
          .required()
          .prefix('/blog/')
          .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and dashes only.'),
        Toggle.make('is_active').label('Active').default(true),
        Toggle.make('is_featured').label('Featured').default(false),
        Select.make('author_id')
          .label('Author')
          .relationship({ resource: 'users', titleKey: 'name' })
          .searchable()
          .required(),
      ]),
  ],

  table: {
    columns: [
      TextColumn.make('title')
        .searchable()
        .sortable()
        .weight('semibold')
        .url((record) => `/posts/${String(record.id)}`),
      BooleanColumn.make('is_active').label('Active').sortable(),
      BooleanColumn.make('is_featured').label('Featured').sortable(),
      DateColumn.make('created_at').label('Created').since().sortable().toggleable(),
    ],

    filters: [
      TernaryFilter.make('is_active').label('Status'),
      TernaryFilter.make('is_featured').label('Featured'),
    ],

    actions: [ViewAction.make(), EditAction.make(), DeleteAction.make()],
    bulkActions: [DeleteBulkAction.make()],

    defaultSort: { column: 'created_at', direction: 'desc' },
    emptyState: { heading: 'No products yet' },
  },
});
