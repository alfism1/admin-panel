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
- `.preload()` fetches the full list once instead of searching server-side — right for short lookup
  tables.
- `.native()` renders a plain `<select>`; good for short static lists.

### `Checkbox` / `Toggle`

`.inline(boolean?)` · `.onColor(tone)` · `.offColor(tone)` — tones:
`primary | success | warning | danger | gray`. Both render inline (label beside the control) by
default; `.inline(false)` stacks them.

### `DatePicker`

| Method                                | Description                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| `.time(boolean?)`                     | Adds a time input below the calendar.                                              |
| `.seconds(boolean?)`                  | Widens the stored and displayed patterns to seconds; implies `.time()`.            |
| `.timeOnly(boolean?)`                 | Time-of-day picker with no calendar — Filament's `TimePicker`.                     |
| `.minutesStep(n)`                     | Granularity of the time input, in minutes.                                         |
| `.displayFormat(fmt)`                 | `date-fns` pattern shown to the user.                                              |
| `.format(pattern)`                    | `date-fns` pattern the value is **stored** as. Default: ISO 8601.                  |
| `.minDate(bound)` / `.maxDate(bound)` | `Date`, ISO string, epoch, or a `(ctx) => …` resolver. Enforced in validation too. |
| `.disabledDates(bounds \| Resolver)`  | Individual days to block.                                                          |
| `.weekStartsOn(0–6)`                  | First column of the calendar. `0` is Sunday.                                       |
| `.closeOnDateSelection(boolean?)`     | Default: close on pick, unless `.time()` is on.                                    |
| `.native(boolean?)`                   | Renders the browser's date input instead of the calendar popover.                  |

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

| Method                                                                                  | Description                                                               |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `.label(string \| (record) => string)`                                                  | Button label.                                                             |
| `.icon(name \| LucideIcon)`                                                             | Registry key or any Lucide component.                                     |
| `.iconOnly(boolean?)`                                                                   | Renders as a tinted icon button with a tooltip.                           |
| `.color(tone)` / `.size('sm'\|'md'\|'lg')` / `.tooltip(s)`                              | Presentation.                                                             |
| `.requiresConfirmation({ heading?, description?, confirmLabel?, cancelLabel?, icon? })` | Confirmation dialog.                                                      |
| `.form(schema)`                                                                         | Opens a modal built from a form schema; the result arrives as `ctx.data`. |
| `.modalWidth('sm'\|'md'\|'lg'\|'xl'\|'2xl')`                                            | Modal size.                                                               |
| `.action(async (ctx) => …)`                                                             | The handler.                                                              |
| `.url((record) => string, { openInNewTab? })`                                           | Navigation instead of a handler.                                          |
| `.visible(...)` / `.disabled(...)` / `.authorize(...)`                                  | Gating.                                                                   |
| `.successNotification(string \| false)` / `.failureNotification(string \| false)`       | Toast control.                                                            |

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

`ViewAction`, `EditAction`, `DeleteAction`, `CreateAction`, `BulkAction`, `DeleteBulkAction`.

They resolve their route, label, permission and (for deletes) the data-provider call from the
surrounding resource, so `EditAction.make()` takes no arguments. Anything you set explicitly wins.

---

## Resource definition

```ts
defineResource({
  name: 'users',              // registry key and API path segment
  model?: 'User',
  route?: '/users',           // defaults to `/${name}`
  navigation?: { label?, icon?, group?, sort?, badge? } | false,
  labels?: { singular?, plural? },
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
