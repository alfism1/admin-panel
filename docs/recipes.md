# Recipes

Practical extensions that stay outside `src/core/`.

---

## A custom field control

Every builder has `.customComponent()`. The component receives the same props the built-in controls
get, so labels, errors, `aria-describedby` and disabled state are already handled for you.

```tsx
// src/resources/components/ColorPicker.tsx
import type { FieldRenderProps } from '@/core/forms/types';

export function ColorPicker({ value, onChange, state }: FieldRenderProps<string>) {
  return (
    <input
      id={state.id}
      type="color"
      value={typeof value === 'string' ? value : '#000000'}
      disabled={state.disabled}
      aria-invalid={Boolean(state.error)}
      aria-describedby={state.describedBy}
      onChange={(event) => onChange(event.target.value)}
      className="border-input bg-card h-9 w-16 rounded-md border"
    />
  );
}
```

```tsx
import type { FieldControl } from '@/core/forms/types';

TextInput.make('brand_color')
  .default('#f59e0b')
  .customComponent(ColorPicker as FieldControl);
```

The cast erases the value type at the framework boundary; your component keeps its precise props.
`src/resources/components/PermissionMatrix.tsx` is a full-size example.

### A reusable field class

If you need the same control in many resources, subclass `Field` in your own folder — still no core
changes:

```ts
// src/resources/fields/ColorInput.ts
import { Field, type FieldConfig } from '@/core/forms/Field';
import type { FieldControl, ValueType } from '@/core/forms/types';
import { ColorPicker } from '../components/ColorPicker';

export interface ColorInputConfig extends FieldConfig {
  swatches?: string[];
}

export class ColorInput extends Field<string, ColorInputConfig> {
  readonly valueType: ValueType = 'string';

  static make(name: string): ColorInput {
    return new ColorInput({ name, validation: {} });
  }

  get control(): FieldControl {
    return ColorPicker as FieldControl;
  }

  swatches(values: string[]): this {
    return this.mutate({ swatches: values });
  }
}
```

---

## A repeating group of fields

`Repeater` is a core field — it knows nothing about this app, so it sits in
[`src/core/forms/fields/Repeater.ts`](../src/core/forms/fields/Repeater.ts) beside `TextInput` and
`FileUpload`. Every method is listed in the [API reference](api-reference.md#repeater); this is how
it reads in a resource:

```tsx
import { Repeater } from '@/core/forms/fields/Repeater';

form: [
  Repeater.make('line_items')
    .label('Line items')
    .schema([
      Select.make('product_id').relationship({ resource: 'products', titleKey: 'name' }).required(),
      TextInput.make('quantity').numeric().default('1').required(),
      TextInput.make('note').visible((ctx) => ctx.get('quantity') !== '1'),
    ])
    .grid(3)
    .minItems(1)
    .maxItems(20)
    .distinct('product_id')
    .cloneable()
    .collapsible()
    .itemLabel((item) => (item.note ? `${String(item.product_id)} — ${String(item.note)}` : null))
    .orderColumn('position'),
];
```

The value is a plain array on the record, so the API sees
`{ line_items: [{ product_id: 3, quantity: '2', position: 0 }, …] }` — store it in a JSON column, or
split it server-side in your route.

Two shorthands cover the common shapes:

```ts
// A flat array of scalars: ['ada@example.com', 'grace@example.com']
Repeater.make('invitees').simple(TextInput.make('email').email().required());

// Rows under a shared header rather than cards
Repeater.make('rates')
  .schema([TextInput.make('band'), TextInput.make('percent').numeric()])
  .table([{ label: 'Band' }, { label: 'Percent', width: '8rem', align: 'end' }])
  .compact();
```

Inside an item, resolvers are scoped to that item: `ctx.get('quantity')` reads the sibling in the
same row, and `ctx.get('../../title')` climbs back out to the top-level form — the same shape as
Filament's `$get('../../title')`.

The post form ships both storage shapes as worked examples — see
[`PostResource.tsx`](../src/resources/PostResource.tsx), the **FAQ** and **Blocks** tabs.

### A repeater stored in a JSON column

The simplest case: the array _is_ the column, so it rides the ordinary create/update payload and
needs no server code. `posts.faqs` is declared in
[`20260819090000_post_repeaters.ts`](../server/migrations/20260819090000_post_repeaters.ts):

```ts
table.json('faqs'); // …or table.text('faqs') where the dialect has no JSON type
```

SQLite and SQL Server hand that column back as a string. `Repeater` parses it on the way in, so the
same field works on every dialect; `formatStateUsing()` still overrides if you need something else.

### A repeater backed by a child table

`relationship()` maps the items to rows of another resource. The migration creates the table and
introspection turns it into a REST resource on its own — again, no route to write:

```ts
await knex.schema.createTable('post_blocks', (table) => {
  table.increments('id').primary();
  table.integer('post_id').notNullable().references('id').inTable('posts').onDelete('CASCADE');
  table.string('kind', 20).notNullable().defaultTo('paragraph');
  table.text('body').defaultTo('');
  table.integer('position').notNullable().defaultTo(0);
  table.index(['post_id', 'position']);
});
```

```tsx
Repeater.make('blocks')
  .relationship({ resource: 'post_blocks', foreignKey: 'post_id' })
  .orderColumn('position')
  .schema([Select.make('kind').options(KINDS).required(), Textarea.make('body').required()]);
```

Filling and saving happen at **seam 1**, through the seven methods a `DataProvider` already has.
Install the decorator once at boot:

```ts
// src/main.tsx
import { setDataProvider } from '@/core/data/DataProvider';
import { restDataProvider } from '@/core/data/restDataProvider';
import { withRepeaterRelationships } from '@/resources/data/repeaterRelationships';

setDataProvider(withRepeaterRelationships(restDataProvider));
```

`getOne` loads the children onto the record; `create`/`update` lift the array out of the payload,
save the parent, then diff the items against the rows on file — known ids are updated, the rest
inserted, and anything nobody kept is deleted. `delete`/`deleteMany` clear the children first so the
result does not depend on the schema declaring `ON DELETE CASCADE`.

Because it is a decorator, it composes: wrap your own provider instead of `restDataProvider` and
relationships keep working over GraphQL or anything else.

`VITE_USE_MOCK=true` needs the fixture table too. The core mock backend is a closed layer, so
[`mockPostBlocks.ts`](../src/resources/data/mockPostBlocks.ts) wraps its Axios adapter rather than
editing it — the same trick `main.tsx` already plays to install the mock at all:

```ts
apiClient.defaults.adapter = withMockPostBlocks(mockAdapter);
```

---

## A custom table cell

```tsx
// src/resources/components/ProgressCell.tsx
import type { ColumnRenderProps } from '@/core/tables/types';

export function ProgressCell({ value }: ColumnRenderProps) {
  const percent = Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <div className="flex items-center gap-2">
      <div className="bg-muted h-1.5 w-24 overflow-hidden rounded-full">
        <div className="bg-primary h-full" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-muted-foreground text-xs tabular-nums">{percent}%</span>
    </div>
  );
}
```

```ts
TextColumn.make('completion').customComponent(ProgressCell);
```

For one-off formatting, `.formatStateUsing((state, record) => <span>…</span>)` is usually enough.

---

## Swapping the data provider

Implement the interface and install it once at boot:

```ts
// src/lib/graphqlDataProvider.ts
import type { DataProvider } from '@/core/data/types';

export const graphqlDataProvider: DataProvider = {
  async getList(resource, params) {
    /* … */
  },
  async getOne(resource, id) {
    /* … */
  },
  async create(resource, data) {
    /* … */
  },
  async update(resource, id, data) {
    /* … */
  },
  async delete(resource, id) {
    /* … */
  },
  async deleteMany(resource, ids) {
    /* … */
  },
  async getMany(resource, ids) {
    /* … */
  },
};
```

```ts
// src/main.tsx
import { setDataProvider } from '@/core/data/DataProvider';
setDataProvider(graphqlDataProvider);
```

Or scope it to one entity:

```ts
defineResource({ name: 'reports', dataProvider: analyticsProvider, table: { … } });
```

### Adapting a different REST shape

If your API returns `{ items, totalCount }` instead of `{ data, meta }`, wrap the default provider
rather than rewriting it:

```ts
import { restDataProvider } from '@/core/data/restDataProvider';
import { apiClient } from '@/core/data/apiClient';

export const provider: DataProvider = {
  ...restDataProvider,
  async getList(resource, params) {
    const { data } = await apiClient.get(`/${resource}`, {
      params: {
        offset: (params.page - 1) * params.perPage,
        limit: params.perPage,
        q: params.search,
      },
    });
    return {
      data: data.items,
      meta: {
        total: data.totalCount,
        page: params.page,
        perPage: params.perPage,
        lastPage: Math.max(1, Math.ceil(data.totalCount / params.perPage)),
      },
    };
  },
};
```

---

## Custom pages for a resource

Replace any generated page while keeping the rest:

```tsx
defineResource({
  name: 'orders',
  pages: { list: true, create: false, edit: CustomOrderEditor, view: true },
  table: { … },
});
```

`CustomOrderEditor` is a plain component; read the id with `useParams()` and reuse `SchemaForm` if
you only need to wrap it in extra chrome.

---

## Non-resource pages in the sidebar

```tsx
// src/App.tsx
registerNavigationItems([
  {
    key: 'reports',
    label: 'Reports',
    path: '/reports',
    icon: 'gauge',
    group: 'Insights',
    sort: 5,
    permission: 'report.view',
  },
]);
```

Then add the route inside the protected layout:

```tsx
<Route
  path="/reports"
  element={
    <ProtectedRoute permission="report.view">
      <ReportsPage />
    </ProtectedRoute>
  }
/>
```

---

## A navigation badge

`badge` runs during render, so it may use hooks:

```tsx
navigation: {
  label: 'Orders',
  icon: 'shopping-cart',
  badge: () => {
    const { data } = useQuery({
      queryKey: ['orders', 'pending-count'],
      queryFn: () => apiClient.get('/orders/pending-count').then((r) => r.data.count),
    });
    return data ? String(data) : null;
  },
}
```

---

## Custom actions with a modal form

```ts
Action.make('assign')
  .label('Assign reviewer')
  .icon('user-plus')
  .authorize('post.update')
  .form([
    Select.make('reviewer_id')
      .relationship({ resource: 'users', titleKey: 'name' })
      .searchable()
      .required(),
    Textarea.make('note').rows(3),
  ])
  .action(async ({ record, data }) => {
    await apiClient.post(`/posts/${record.id}/assign`, data);
  })
  .successNotification('Reviewer assigned.');
```

Add `.requiresConfirmation()` to insert a confirmation step between the form and the handler.

---

## Theming

Design tokens live as CSS variables in `src/index.css` — one `:root` block for light and one
`.dark` block. Change `--primary` and the whole panel follows; nothing else needs editing.

```css
:root {
  --primary: oklch(0.62 0.19 255);
  --primary-foreground: oklch(0.99 0.01 255);
}
.dark {
  --primary: oklch(0.7 0.17 255);
  --primary-foreground: oklch(0.18 0.04 255);
}
```

The border radius scale is driven by a single `--radius`.
