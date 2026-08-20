# API reference

Every builder method returns a **new instance** — chains are safe to share and reuse.

Anywhere a signature shows `Resolver<T>`, you may pass either a static value or
`(ctx: FieldContext) => T`.

```ts
interface FieldContext {
  state: unknown;
  get: <T>(path: string) => T;
  set: (path: string, value: unknown) => void;
  record: Record<string, unknown> | null;
  operation: 'create' | 'edit' | 'view';
  user: AuthUser | null;
  can: (permission: string) => boolean;
}
```

---

## Form fields

### `Field` — shared by every field

| Method                                                 | Description                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `.label(string \| Resolver<string>)`                   | Overrides the label. Default: `labelize(name)` — `first_name` → "First Name", `role_id` → "Role". |
| `.hiddenLabel(boolean?)`                               | Renders the control without a visible label (still exposed to screen readers).                    |
| `.helperText(string \| Resolver<string>)`              | Hint below the control, wired via `aria-describedby`.                                             |
| `.placeholder(string)`                                 | Placeholder text.                                                                                 |
| `.autofocus(boolean?)`                                 | Focuses on mount.                                                                                 |
| `.default(value \| Resolver)`                          | Value used when the record has none.                                                              |
| `.formatStateUsing(fn)`                                | Transforms the value when hydrating into the form.                                                |
| `.dehydrateStateUsing(fn)`                             | Transforms the value on submit.                                                                   |
| `.dehydrated(boolean \| (state) => boolean)`           | Whether to include the field in the payload.                                                      |
| `.required(boolean? \| Resolver<boolean>)`             | Required rule.                                                                                    |
| `.nullable()`                                          | Marks the value as nullable.                                                                      |
| `.minLength(n)` / `.maxLength(n)`                      | String length bounds.                                                                             |
| `.min(n)` / `.max(n)`                                  | Numeric bounds.                                                                                   |
| `.email()` / `.url()` / `.numeric()`                   | Format rules.                                                                                     |
| `.regex(pattern, message?)`                            | Pattern rule.                                                                                     |
| `.rule((value, allValues) => true \| string)`          | Arbitrary synchronous rule; return the message to fail.                                           |
| `.unique({ resource, column?, ignoreRecord? })`        | Async check via the data provider.                                                                |
| `.confirmed()`                                         | Requires a matching `${name}_confirmation` field.                                                 |
| `.disabled(boolean? \| Resolver<boolean>)`             | Disables the control.                                                                             |
| `.readOnly(boolean? \| Resolver<boolean>)`             | Read-only control.                                                                                |
| `.hidden(...)` / `.visible(...)`                       | Visibility; hidden fields are never submitted.                                                    |
| `.hiddenOn(op)` / `.visibleOn(op)` / `.disabledOn(op)` | Per operation: `'create' \| 'edit' \| 'view'`.                                                    |
| `.live({ onBlur?, debounce? })`                        | Debounces `afterStateUpdated`. Cross-field reads are reactive without it.                         |
| `.afterStateUpdated((ctx) => void)`                    | Side effect on change; `ctx` adds `state` and `oldState`.                                         |
| `.columnSpan(n \| 'full')` / `.columnSpanFull()`       | Grid span inside the parent layout.                                                               |
| `.authorize(permission \| Resolver<boolean>)`          | Unauthorized fields are not rendered and not submitted.                                           |
| `.customComponent(Component)`                          | Escape hatch — render your own control.                                                           |

### `TextInput`

`.password()` · `.revealable()` · `.email()` · `.tel()` · `.url()` · `.numeric(step?)` ·
`.prefix(node)` · `.suffix(node)` · `.mask(pattern)` · `.type(htmlType)`

`mask` uses `9` for a digit and `a` for a letter; every other character is a literal:
`.mask('9999-9999')`.

### `Textarea`

`.rows(n)` · `.autosize()` — with `.maxLength()` a character counter appears.

### `Select`

`.options(Record<string,string> \| Option[] \| Resolver)` · `.multiple()` · `.searchable()` ·
`.preload()` · `.relationship({ resource, titleKey, valueKey?, query? })` · `.native()`

- `.relationship()` loads options through the data provider and resolves labels for values that are
  not on the current page.
- `.searchable()` filters in the browser for static options, and searches server-side (debounced)
  only when a `.relationship()` is attached and `.preload()` is off.
- `.preload()` fetches the full list once instead of searching server-side — right for short lookup
  tables.
- `.native()` renders a plain `<select>`; good for short static lists.

### `Checkbox` / `Toggle`

`.inline(boolean?)` · `.onColor(tone)` · `.offColor(tone)` — tones:
`primary | success | warning | danger | gray`. Both render inline (label beside the control) by
default; `.inline(false)` stacks them.

### `DatePicker`

| Method                                | Description                                                                                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.time(boolean?)`                     | Adds a time input below the calendar.                                                                                                                                                |
| `.seconds(boolean?)`                  | Widens the stored and displayed patterns to seconds; implies `.time()`.                                                                                                              |
| `.timeOnly(boolean?)`                 | Time-of-day picker with no calendar — Filament's `TimePicker`.                                                                                                                       |
| `.minutesStep(n)`                     | Granularity of the time input, in minutes.                                                                                                                                           |
| `.displayFormat(fmt)`                 | `date-fns` pattern shown to the user.                                                                                                                                                |
| `.format(pattern)`                    | `date-fns` pattern the value is **stored** as. Default: ISO 8601.                                                                                                                    |
| `.minDate(bound)` / `.maxDate(bound)` | `Date`, epoch, an ISO string, or a string in the field's own `.format()` — `'09:00'` on a `.timeOnly()` picker. Also accepts a `(ctx) => …` resolver, and is enforced in validation. |
| `.disabledDates(bounds \| Resolver)`  | Individual days to block.                                                                                                                                                            |
| `.weekStartsOn(0–6)`                  | First column of the calendar. `0` is Sunday.                                                                                                                                         |
| `.closeOnDateSelection(boolean?)`     | Default: close on pick, unless `.time()` is on.                                                                                                                                      |
| `.native(boolean?)`                   | Renders the browser's date input instead of the calendar popover.                                                                                                                    |

- **Storage.** ISO 8601 by default, which is right for a `timestamp` column. For a bare `date` or
  `time` column use `.format('yyyy-MM-dd')` / `.format('HH:mm')` — an ISO instant carries a timezone
  that shifts the day for anyone west of Greenwich. Reading is tolerant either way, so records that
  still hold a full timestamp keep working.
- **Bounds** are compared at the granularity the picker offers: `.maxDate(new Date())` on a date-only
  picker still allows today. Prefer the resolver form (`.maxDate(() => new Date())`) so "today" is
  not frozen at import time.
- `.default()` accepts a `Date` or epoch as well as the stored string form.

### `FileUpload`

| Method                            | Description                                                        |
| --------------------------------- | ------------------------------------------------------------------ |
| `.image(boolean?)`                | Accepts `image/*` and renders thumbnails.                          |
| `.avatar(boolean?)`               | Single circular image preview.                                     |
| `.multiple(boolean?)`             | Stores an array of URLs instead of one.                            |
| `.acceptedFileTypes([])`          | MIME types, `type/*` wildcards, or `.ext` suffixes.                |
| `.maxSize(kb)` / `.minSize(kb)`   | Per-file size bounds.                                              |
| `.maxFiles(n)` / `.minFiles(n)`   | Count bounds. A positive `minFiles` also makes the field required. |
| `.directory(path)`                | Sent alongside the file so the server can namespace it.            |
| `.reorderable(boolean?)`          | Move-up / move-down controls on each item.                         |
| `.downloadable()` / `.openable()` | Adds a download link / new-tab link to each item.                  |
| `.previewable(boolean?)`          | `false` lists file names instead of thumbnails.                    |
| `.imagePreviewHeight(px)`         | Fixed preview height.                                              |
| `.panelLayout('grid' \| 'list')`  | Default: grid for previewable images, list otherwise.              |
| `.uploadHandler(fn)`              | Replaces the default `POST /uploads` multipart request.            |
| `.deleteFileUsing(fn)`            | Called when a file is removed, so storage can be cleaned up.       |

Uploads to `POST /uploads` as multipart by default and stores the returned URL.

- Type and size are checked on **drop** as well as on browse — the `accept` attribute only constrains
  the file dialog.
- A batch upload uses `allSettled`: files that succeed are kept even when a sibling fails, and the
  failures are reported separately.
- `.maxFiles()` and `.minFiles()` are enforced in validation, not just in the picker.

### `Hidden`

Carries a value through the form without rendering anything.

### `Repeater`

Stores an array on the record and renders the same schema once per item, bound to
`name.index.child`. Nothing is cloned: `ComponentRenderer` takes a `scope`, so each item is the one
schema rendered under a different path prefix.

| Method                                          | Description                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `.schema([...])`                                | The fields (and layouts) repeated in each item.                    |
| `.simple(field)`                                | One field per item, stored as a flat array of scalars.             |
| `.defaultItems(n)`                              | Blank items to start with on create. Default `1`.                  |
| `.default([...])`                               | An explicit starting array; turns `defaultItems` seeding off.      |
| `.minItems(n)` / `.maxItems(n)`                 | Count bounds. A positive `minItems` also makes the field required. |
| `.distinct(name \| [names])`                    | Rejects items that repeat a value for the named child.             |
| `.addable(Resolver<boolean>?)`                  | Whether new items can be added.                                    |
| `.deletable(Resolver<boolean>?)`                | Whether items can be removed.                                      |
| `.cloneable(Resolver<boolean>?)`                | Adds a duplicate button. Off by default.                           |
| `.reorderable(Resolver<boolean>?)`              | Master switch for reordering.                                      |
| `.reorderableWithButtons(boolean?)`             | Up / down buttons. On by default.                                  |
| `.reorderableWithDragAndDrop(boolean?)`         | Drag handle. On by default.                                        |
| `.addActionLabel(text)`                         | Overrides `Add to {label}`.                                        |
| `.addActionAlignment('start'\|'center'\|'end')` | Where the add button sits.                                         |
| `.collapsible()` / `.collapsed()`               | Foldable items; `collapsed()` implies `collapsible()`.             |
| `.itemLabel((item, index) => string)`           | Titles an item from its own state.                                 |
| `.itemNumbers(boolean?)`                        | The `1`, `2`, `3` badge. On by default.                            |
| `.grid(n \| { sm, md, lg })`                    | Lays each item's fields out in columns.                            |
| `.table([{ label, width?, align? }])`           | Renders items as rows under a shared header instead of as cards.   |
| `.compact(boolean?)`                            | Tighter padding.                                                   |
| `.orderColumn(key)`                             | Writes each item's position into that key on submit.               |

Inside an item, `ctx.get()` and `ctx.set()` are **item-relative**: `get('quantity')` reads that
item's `quantity`. `../` climbs one level out, so `get('../../title')` reaches a top-level field —
the same shape as Filament's `$get('../../title')`. Because the scope lives in the context the slot
builds, this covers **every** resolver a field declares, including subclass-specific ones like
`Select.options`.

Child validation runs per item and shares `compileFieldValidator` with `buildZodSchema`, so
`required()`, the length/format rules, the field's own `validate()` and any `rule()` you added all
produce the messages they would at the top level. `buildZodSchema` can only attach an issue to the
repeater's own path, so the form-level message is a count (`2 items need attention.`) and the
specific messages are rendered next to the offending item.

#### `distinct()` and `fixIndistinctState()`

| Method                       | Description                                            |
| ---------------------------- | ------------------------------------------------------ |
| `.distinct(name \| [names])` | Rejects items that repeat a value for the named child. |
| `.fixIndistinctState(bool?)` | Corrects the clash instead of only reporting it.       |

With `fixIndistinctState()`, the item the user just edited keeps the value and every other item
holding it is reset — `false` for a boolean child, `null` otherwise. A record that _arrives_ holding
duplicates is left alone: the fix only fires on an edit, which is what makes "just edited" knowable.

#### Item actions

`extraItemActions([...])` adds buttons to every item header. They are
[`RepeaterAction`](../src/core/forms/fields/RepeaterAction.ts) instances — core's `Action` is built
around a persisted record and the data provider, which a form item is neither:

```ts
RepeaterAction.make('clear')
  .label('Clear body') // or (item, index) => string
  .icon('x-circle')
  .color('danger')
  .tooltip('Empties the body')
  .visible((item) => Boolean(item.body))
  .disabled((item, index) => index === 0)
  .authorize('post.publish')
  .requiresConfirmation({ heading: '…', description: '…' })
  .action(({ item, index, items, set, replace, remove, field }) => set({ ...item, body: '' }));
```

`set` replaces this item, `replace` the whole array, `remove` drops the item, and `field` is the
repeater's own `FieldContext` for reaching the wider form.

Each built-in control takes a modifier of the same type — return a changed copy to relabel, re-icon,
gate or replace its behaviour outright:

`.addAction(fn)` · `.deleteAction(fn)` · `.cloneAction(fn)` · `.moveUpAction(fn)` ·
`.moveDownAction(fn)` · `.reorderAction(fn)` (the drag handle) · `.collapseAction(fn)`

```ts
Repeater.make('blocks').deleteAction((action) =>
  action.requiresConfirmation({ description: 'Removed from the post when you save.' }),
);
```

The add action has no item, so its predicates receive `({}, itemCount)`.

#### `relationship()` — items as rows of another resource

| Method                                                       | Description                                          |
| ------------------------------------------------------------ | ---------------------------------------------------- |
| `.relationship({ resource, foreignKey, … })`                 | Backs the items with another resource's rows.        |
| `.mutateRelationshipDataBeforeFillUsing(fn)`                 | Runs on each loaded child before it becomes an item. |
| `.mutateRelationshipDataBeforeCreateUsing(fn)`               | Runs on an item before it is inserted.               |
| `.mutateRelationshipDataBeforeSaveUsing(fn)`                 | Runs on an item before an existing child is updated. |
| `.modifyRecordsUsing(fn)`                                    | Filters or reorders the loaded children.             |
| `.afterCreate(fn)` · `.afterUpdate(fn)` · `.afterDelete(fn)` | Fire per child row.                                  |

`relationship()` also takes optional `filters`, `sort` and `perPage`; without `sort` it orders by
`orderColumn()` when one is set.

This needs the decorator installed once at boot — see
[`src/main.tsx`](../src/main.tsx) and [`recipes.md`](recipes.md#a-repeater-backed-by-a-child-table):

```ts
setDataProvider(withRepeaterRelationships(restDataProvider));
```

Everything happens at seam 1 through the seven methods a `DataProvider` already has, so no endpoint
is written and the mock backend and the Node API behave identically. On save, items carrying a known
id are updated, the rest are inserted, and rows nobody kept are deleted; `delete`/`deleteMany` on the
parent clear the children first, so behaviour does not depend on `ON DELETE CASCADE`.

Worth knowing:

- The repeater's key must be **top-level** on the form. A dotted name is silently left in the parent
  payload.
- `getList` does not hydrate — a 25-row table would cost 25 extra requests for data no column shows.
- The sync is several requests, not a transaction. Writes run before deletes so a mid-way failure
  cannot lose a row the form still holds.
- Cloning an item drops its `id`, or the copy would save over the row it came from.

Not implemented: `fixIndistinctState()` does not disable the conflicting _option_ the way Filament's
`Select` does, and `table()` renders a CSS grid rather than a `<table>`.

---

## Form layouts

| Layout                  | Methods                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `Section.make(heading)` | `.description(...)` · `.columns(n)` · `.collapsible()` · `.collapsed()` · `.aside()` · `.schema([...])` |
| `Grid.make(columns?)`   | `.columns(n \| { sm, md, lg })` · `.schema([...])`                                                      |
| `Tabs.make(id?)`        | `.tabs([Tab.make('Label').icon('file-text').columns(2).schema([...])])`                                 |

Layouts also accept `.visible()`, `.hidden()`, `.visibleOn()`, `.hiddenOn()`, `.authorize()` and
`.columnSpan()`. All tabs stay mounted, so validation covers fields on inactive tabs.

Supported column counts map to Tailwind classes: `1, 2, 3, 4, 6, 12`.

---

## Table columns

### `Column` — shared by every column

`make(name)` accepts dot notation: `TextColumn.make('role.name')`.

| Method                                             | Description                                                             |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| `.label(string)`                                   | Header text. Pass `''` for an unlabelled column such as an avatar.      |
| `.sortable(boolean? \| { column })`                | Click to sort: asc → desc → unsorted.                                   |
| `.searchable(boolean? \| { column })`              | Adds the column to global search; the search box appears automatically. |
| `.toggleable({ hiddenByDefault? })`                | Adds the column to the "Columns" menu. Preference persists per user.    |
| `.visible(boolean \| (ctx) => boolean)`            | Conditional column.                                                     |
| `.authorize(permission)`                           | Hides the column when the permission is missing.                        |
| `.alignStart()` / `.alignCenter()` / `.alignEnd()` | Cell alignment.                                                         |
| `.width(css)`                                      | Fixed column width.                                                     |
| `.wrap()`                                          | Allows the cell to wrap instead of truncating.                          |
| `.tooltip((record) => string)`                     | Hover text.                                                             |
| `.url((record) => string, { openInNewTab? })`      | Links the cell.                                                         |
| `.action((record) => void)`                        | Click handler on the cell.                                              |
| `.formatStateUsing((state, record) => ReactNode)`  | Full control over the rendered value.                                   |
| `.default(string)` / `.placeholder(string)`        | Fallback for empty values.                                              |
| `.customComponent(Component)`                      | Escape hatch.                                                           |

### `TextColumn`

`.limit(n)` · `.words(n)` · `.weight('normal'|'medium'|'semibold'|'bold')` ·
`.color(tone)` · `.copyable()` · `.prefix(s)` · `.suffix(s)` · `.numeric({ decimals })` ·
`.money(currency, locale?)` · `.description(fn, { position })` · `.badge(tone?)`

### `BadgeColumn`

`.colors(map | (state, record) => tone)` · `.icons(map)`

Tones: `primary | secondary | success | warning | danger | info | gray`.

### `BooleanColumn`

`.trueIcon(icon)` · `.falseIcon(icon)` · `.trueColor(tone)` · `.falseColor(tone)`

### `ImageColumn`

`.circular()` · `.square()` · `.size(px)` · `.stacked()` · `.defaultImageUrl(url)`

Falls back to initials derived from the record's `name`/`title`.

### `DateColumn`

`.dateFormat(fmt)` · `.dateTimeFormat(fmt?)` · `.since()` · `.timezone('Asia/Jakarta')`

---

## Filters

Filters serialize to a single query-string value (`?f_<name>=…`) so a filtered view is shareable.

| Filter                       | Methods                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `SelectFilter.make(name)`    | `.options(map)` · `.relationship({ resource, titleKey })` · `.multiple()` · `.searchable()` |
| `TernaryFilter.make(name)`   | `.trueLabel(s)` · `.falseLabel(s)` · `.blankLabel(s)`                                       |
| `DateRangeFilter.make(name)` | `.time()` — serializes as `from..to`                                                        |

All filters support `.label(s)`, `.placeholder(s)` and `.authorize(permission)`.

---

## Table schema

```ts
table: {
  columns: Column[];
  filters?: Filter[];
  actions?: Action[];          // per row
  bulkActions?: Action[];      // selection bar appears automatically
  headerActions?: Action[];    // beside the Create button
  defaultSort?: { column: string; direction: 'asc' | 'desc' };
  perPageOptions?: number[];   // default [10, 25, 50, 100]
  defaultPerPage?: number;     // default 25
  striped?: boolean;
  poll?: number;               // auto-refetch interval in ms
  emptyState?: { heading?: string; description?: string; icon?: IconSpec };
  recordUrl?: (record) => string;
}
```

Pagination, sorting, search, column toggling, row selection, URL sync, loading skeletons, empty and
error states and the responsive card view are all automatic.

---

## Actions

| Method                                                                                           | Description                                                                                                                         |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `.label(string \| (record) => string)`                                                           | Button label.                                                                                                                       |
| `.icon(name \| LucideIcon)`                                                                      | Registry key or any Lucide component.                                                                                               |
| `.iconOnly(boolean?)`                                                                            | Renders as a tinted icon button with a tooltip.                                                                                     |
| `.color(tone)` / `.size('sm'\|'md'\|'lg')` / `.tooltip(s)`                                       | Presentation.                                                                                                                       |
| `.requiresConfirmation({ heading?, description?, confirmLabel?, cancelLabel?, icon? } \| false)` | Confirmation dialog. Built-ins generate resource-aware copy; anything you pass overrides that field, and `false` opts out entirely. |
| `.form(schema)`                                                                                  | Opens a modal built from a form schema; the result arrives as `ctx.data`.                                                           |
| `.modalWidth('sm'\|'md'\|'lg'\|'xl'\|'2xl')`                                                     | Modal size.                                                                                                                         |
| `.action(async (ctx) => …)`                                                                      | The handler.                                                                                                                        |
| `.url((record) => string, { openInNewTab? })`                                                    | Navigation instead of a handler.                                                                                                    |
| `.visible(...)` / `.disabled(...)` / `.authorize(...)`                                           | Gating.                                                                                                                             |
| `.successNotification(string \| false)` / `.failureNotification(string \| false)`                | Toast control.                                                                                                                      |

```ts
interface ActionContext {
  record: RecordShape | null; // row actions
  records: RecordShape[]; // bulk actions
  data: FormValues; // modal form result
  refresh: () => void; // invalidate this resource's queries
  close: () => void;
  notify: (options: NotifyOptions) => void;
  navigate: NavigateFunction;
}
```

### Built-ins

| Action                | Where  | Does                                                       | Gate      |
| --------------------- | ------ | ---------------------------------------------------------- | --------- |
| `ViewAction`          | row    | Links to `/:id`                                            | `view`    |
| `EditAction`          | row    | Links to `/:id/edit`                                       | `update`  |
| `CreateAction`        | header | Links to `/create`                                         | `create`  |
| `DeleteAction`        | row    | `delete` through the provider, confirms first              | `delete`  |
| `DeleteBulkAction`    | bulk   | `deleteMany`, confirms first                               | `delete`  |
| `ReplicateAction`     | row    | Reads the record and `create`s a copy                      | `create`  |
| `ReplicateBulkAction` | bulk   | One copy per selected record, confirms first               | `create`  |
| `ExportBulkAction`    | bulk   | Downloads the selection as CSV, no request                 | `viewAny` |
| `BulkAction`          | bulk   | Base class for your own; `ctx.records` holds the selection | —         |

They resolve their route, label, permission, confirmation copy and data-provider call from the
surrounding resource, so `EditAction.make()` takes no arguments. Anything you set explicitly wins.

#### Duplicating a record

`ReplicateAction` re-reads the record through `getOne` — the row in the table carries only the
columns on screen — then drops `id`, `created_at` and `updated_at` and creates what is left.

| Method                                           | Description                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `.exclude(...columns)`                           | Further columns the copy must not carry. Accumulates across calls.  |
| `.beforeReplicaSaved((replica, source) => data)` | Rewrites the copy before it is created; may be async.               |
| `.redirectTo('edit' \| 'view' \| false)`         | Opens the copy afterwards. Ignored when several records are copied. |

```ts
ReplicateAction.make()
  .exclude('views', 'author')
  .beforeReplicaSaved((replica) => ({
    ...replica,
    title: `${String(replica.title)} (copy)`,
    slug: `${String(replica.slug)}-copy`,
    status: 'draft',
  }))
  .redirectTo('edit');
```

Unique columns are yours to handle — a copy that keeps a unique slug or email is rejected by the
server, so rewrite it in `.beforeReplicaSaved()` or leave it out and let the form fill it in.

#### Exporting a selection

`ExportBulkAction` writes the rows already in the browser to a CSV file. Nothing is fetched, so it
exports the selection, never the whole table.

| Method                              | Description                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------- |
| `.columns({ key: 'Header' })`       | Export shape; dot-notation reaches embeds. Defaults to the table's columns. |
| `.fileName(string \| () => string)` | Defaults to `<resource>-<yyyy-mm-dd>.csv`.                                  |
| `.delimiter(string)`                | `;` for locales where Excel splits on semicolons.                           |

```ts
ExportBulkAction.make().columns({ id: 'ID', name: 'Name', 'role.name': 'Role' });
```

Cells that open with `=`, `+`, `-` or `@` are prefixed with an apostrophe so a spreadsheet does not
execute them as formulas.

---

## Resource definition

```ts
defineResource({
  name: 'users',              // registry key and API path segment
  model?: 'User',
  route?: '/users',           // defaults to `/${name}`
  navigation?: { label?, icon?, group?, sort?, badge? } | false,
  labels?: { singular?, plural? }, // derived from `name` when omitted: `users` -> User / Users
  recordTitleKey?: 'name',    // breadcrumbs and delete confirmations
  permissions?: { viewAny?, view?, create?, update?, delete? },
  form?: FormComponent[],
  table: TableSchema,
  infolist?: Column[],        // view page; defaults to table.columns
  pages?: { list?, create?, edit?, view? },   // false to disable, or a component to override
  dataProvider?: DataProvider,
});
```

Generated routes, each wrapped in a permission gate:

| Path              | Page       | Gate      |
| ----------------- | ---------- | --------- |
| `/users`          | ListPage   | `viewAny` |
| `/users/create`   | CreatePage | `create`  |
| `/users/:id`      | ViewPage   | `view`    |
| `/users/:id/edit` | EditPage   | `update`  |

---

## Notifications

```ts
import { notify } from '@/core/ui/notify';

notify.success('Saved.');
notify.error('Could not save.', 'Check your connection.');
notify.info(title, description?);
notify.warning(title, description?);
```

## Icons

Pass a registry key (`'users'`, `'check-circle'`, …) or any `lucide-react` component:

```ts
import { Package } from 'lucide-react';
navigation: {
  icon: Package;
}
```

The registry lives in `src/core/ui/icon.tsx` and exists so icons stay tree-shakeable while still
being referable by string from resource metadata.
