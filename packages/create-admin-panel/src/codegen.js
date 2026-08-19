/**
 * Turns the introspected schema into resource files.
 *
 * The shape comes straight off `ResourceSchema` in `server/db/types.ts`, so this
 * reads whatever the adapter already knows: columns, kinds, nullability,
 * foreign keys and the text columns global search runs against.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Managed by the database or by the ORM — never editable in a generated form. */
const TIMESTAMP_COLUMNS = new Set([
  'created_at',
  'updated_at',
  'deleted_at',
  'createdAt',
  'updatedAt',
  'deletedAt',
]);

/** Columns whose value must never be rendered into a table cell. */
const SECRET_PATTERN = /password|secret|token|hash|salt/i;

/** In priority order — the first one present becomes the record's display title. */
const TITLE_CANDIDATES = ['name', 'title', 'label', 'slug', 'username', 'email'];

/** Beyond this a generated table is unreadable; the rest stay one `.toggleable()` away. */
const MAX_VISIBLE_COLUMNS = 6;

export function toPascalCase(value) {
  return value
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

export function singularize(value) {
  if (/ies$/i.test(value)) return value.replace(/ies$/i, 'y');
  if (/(ss|us|is)$/i.test(value)) return value;
  if (/(ch|sh|x|z|s)es$/i.test(value)) return value.replace(/es$/i, '');
  if (/s$/i.test(value)) return value.replace(/s$/i, '');
  return value;
}

/** `user_id` → `User`, `created_at` → `Created`. */
export function labelize(value) {
  return value
    .replace(/_id$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** `varchar(120)` → 120. Anything unbounded stays unbounded. */
function maxLengthFrom(rawType) {
  const match = /^(?:var)?char(?:acter)?(?:\s+varying)?\s*\((\d+)\)/i.exec(rawType ?? '');
  const length = match ? Number(match[1]) : null;
  return length && length > 0 && length <= 65535 ? length : null;
}

function isLongText(rawType) {
  return /text|clob|json/i.test(rawType ?? '');
}

function titleKeyFor(schema) {
  const names = new Set(schema.columns.map((column) => column.name));
  return TITLE_CANDIDATES.find((candidate) => names.has(candidate)) ?? schema.primaryKey;
}

function fieldFor(column, schema, relationsByColumn, schemasByName) {
  const label = labelize(column.name);
  const relation = relationsByColumn.get(column.name);

  if (relation) {
    const target = schemasByName.get(relation.target);
    const titleKey = target ? titleKeyFor(target) : 'name';
    const valueKey = target ? target.primaryKey : 'id';

    const parts = [
      `Select.make('${column.name}')`,
      `.label('${label}')`,
      `.relationship({ resource: '${relation.target}', titleKey: '${titleKey}', valueKey: '${valueKey}' })`,
      '.searchable()',
      '.preload()',
    ];
    if (!column.nullable) parts.push('.required()');
    return parts.join('');
  }

  switch (column.kind) {
    case 'boolean': {
      const parts = [`Toggle.make('${column.name}')`, `.label('${label}')`];
      if (!column.nullable) parts.push('.default(false)');
      return parts.join('');
    }

    case 'date': {
      const parts = [`DatePicker.make('${column.name}')`, `.label('${label}')`];
      if (/_at$|time/i.test(column.name)) parts.push('.time()');
      if (!column.nullable) parts.push('.required()');
      return parts.join('');
    }

    case 'number': {
      const parts = [`TextInput.make('${column.name}')`, `.label('${label}')`, '.numeric()'];
      if (!column.nullable) parts.push('.required()');
      return parts.join('');
    }

    case 'json':
      return [
        `Textarea.make('${column.name}')`,
        `.label('${label}')`,
        '.rows(4)',
        '.columnSpanFull()',
        `.helperText('JSON — edited as raw text.')`,
      ].join('');

    default: {
      if (SECRET_PATTERN.test(column.name)) {
        return [
          `TextInput.make('${column.name}')`,
          `.label('${label}')`,
          '.password()',
          '.revealable()',
          `.helperText('Leave blank to keep the current value.')`,
          `.dehydrated((state) => state !== '' && state !== null && state !== undefined)`,
        ].join('');
      }

      if (isLongText(column.rawType)) {
        return [
          `Textarea.make('${column.name}')`,
          `.label('${label}')`,
          '.rows(3)',
          '.columnSpanFull()',
        ].join('');
      }

      const parts = [`TextInput.make('${column.name}')`, `.label('${label}')`];
      if (/email/i.test(column.name)) parts.push('.email()');
      else if (/^url$|_url$|website|link/i.test(column.name)) parts.push('.url()');

      const maxLength = maxLengthFrom(column.rawType);
      if (maxLength) parts.push(`.maxLength(${maxLength})`);
      if (!column.nullable) parts.push('.required()');
      return parts.join('');
    }
  }
}

function columnFor(column, schema, hidden, relationsByColumn, schemasByName) {
  const label = labelize(column.name);
  const searchable = schema.searchable.includes(column.name);
  const toggle = hidden ? '.toggleable({ hiddenByDefault: true })' : '';

  const suffix = [searchable ? '.searchable()' : '', '.sortable()', toggle].join('');

  const relation = relationsByColumn.get(column.name);
  if (relation) {
    const target = schemasByName.get(relation.target);
    const titleKey = target ? titleKeyFor(target) : 'name';

    // The API embeds the related record under `as`, so the cell reads the
    // joined name rather than the raw key. Not sortable: it is not a column
    // on this table.
    return `BadgeColumn.make('${relation.as}.${titleKey}').label('${label}')${toggle}`;
  }

  switch (column.kind) {
    case 'boolean':
      return `BooleanColumn.make('${column.name}').label('${label}').sortable()${toggle}`;

    case 'date':
      return `DateColumn.make('${column.name}').label('${label}').since().sortable()${toggle}`;

    case 'number':
      return `TextColumn.make('${column.name}').label('${label}').numeric()${suffix}`;

    default:
      return `TextColumn.make('${column.name}').label('${label}')${suffix}`;
  }
}

/** Splits columns into what a form should edit and what a table should show. */
function partition(schema) {
  const relationsByColumn = new Map(schema.relations.map((item) => [item.column, item]));

  const editable = schema.columns.filter(
    (column) =>
      column.name !== schema.primaryKey &&
      !TIMESTAMP_COLUMNS.has(column.name) &&
      column.kind !== 'unknown',
  );

  const displayable = schema.columns.filter(
    (column) =>
      column.name !== schema.primaryKey &&
      !SECRET_PATTERN.test(column.name) &&
      column.kind !== 'json' &&
      column.kind !== 'unknown' &&
      !TIMESTAMP_COLUMNS.has(column.name),
  );

  return { relationsByColumn, editable, displayable };
}

export function generateResource(schema, schemasByName) {
  const { relationsByColumn, editable, displayable } = partition(schema);

  const className = toPascalCase(singularize(schema.name));
  const singular = labelize(singularize(schema.name));
  const plural = labelize(schema.name);
  const permissionKey = singularize(schema.name)
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toLowerCase();
  const titleKey = titleKeyFor(schema);

  const fields = editable.map(
    (column) => `        ${fieldFor(column, schema, relationsByColumn, schemasByName)},`,
  );

  const tableColumns = displayable
    .slice(0, MAX_VISIBLE_COLUMNS)
    .map(
      (column) => `      ${columnFor(column, schema, false, relationsByColumn, schemasByName)},`,
    );

  const extraColumns = displayable
    .slice(MAX_VISIBLE_COLUMNS)
    .map((column) => `      ${columnFor(column, schema, true, relationsByColumn, schemasByName)},`);

  const createdAt = schema.columns.find((column) => /^created_?at$/i.test(column.name));
  if (createdAt) {
    tableColumns.push(
      `      DateColumn.make('${createdAt.name}').label('Created').since().sortable().toggleable(),`,
    );
  }

  const relationFilters = displayable
    .filter((column) => relationsByColumn.has(column.name))
    .map((column) => {
      const relation = relationsByColumn.get(column.name);
      const target = schemasByName.get(relation.target);
      const titleKey = target ? titleKeyFor(target) : 'name';

      return (
        `      SelectFilter.make('${column.name}').label('${labelize(column.name)}')` +
        `.relationship({ resource: '${relation.target}', titleKey: '${titleKey}' }).multiple(),`
      );
    });

  const booleanFilters = displayable
    .filter((column) => column.kind === 'boolean')
    .map(
      (column) => `      TernaryFilter.make('${column.name}').label('${labelize(column.name)}'),`,
    );

  const dateFilters = createdAt
    ? [`      DateRangeFilter.make('${createdAt.name}').label('Created'),`]
    : [];

  const filters = [...relationFilters, ...booleanFilters, ...dateFilters];

  const used = new Set([
    'defineResource',
    'ViewAction',
    'EditAction',
    'DeleteAction',
    'DeleteBulkAction',
    'Section',
  ]);
  const body = [...fields, ...tableColumns, ...extraColumns, ...filters].join('\n');

  for (const [token, symbol] of [
    ['TextInput.make', 'TextInput'],
    ['Textarea.make', 'Textarea'],
    ['Toggle.make', 'Toggle'],
    ['Select.make', 'Select'],
    ['DatePicker.make', 'DatePicker'],
    ['TextColumn.make', 'TextColumn'],
    ['BadgeColumn.make', 'BadgeColumn'],
    ['BooleanColumn.make', 'BooleanColumn'],
    ['DateColumn.make', 'DateColumn'],
    ['TernaryFilter.make', 'TernaryFilter'],
    ['SelectFilter.make', 'SelectFilter'],
    ['DateRangeFilter.make', 'DateRangeFilter'],
  ]) {
    if (body.includes(token)) used.add(symbol);
  }

  const IMPORTS = [
    ['DeleteBulkAction', "import { DeleteBulkAction } from '@/core/actions/BulkAction';"],
    ['DeleteAction', "import { DeleteAction } from '@/core/actions/DeleteAction';"],
    ['EditAction', "import { EditAction } from '@/core/actions/EditAction';"],
    ['ViewAction', "import { ViewAction } from '@/core/actions/ViewAction';"],
    ['DatePicker', "import { DatePicker } from '@/core/forms/fields/DatePicker';"],
    ['Select', "import { Select } from '@/core/forms/fields/Select';"],
    ['TextInput', "import { TextInput } from '@/core/forms/fields/TextInput';"],
    ['Textarea', "import { Textarea } from '@/core/forms/fields/Textarea';"],
    ['Toggle', "import { Toggle } from '@/core/forms/fields/Toggle';"],
    ['Section', "import { Section } from '@/core/forms/layouts/Section';"],
    ['defineResource', "import { defineResource } from '@/core/resources/Resource';"],
    ['BadgeColumn', "import { BadgeColumn } from '@/core/tables/columns/BadgeColumn';"],
    ['BooleanColumn', "import { BooleanColumn } from '@/core/tables/columns/BooleanColumn';"],
    ['DateColumn', "import { DateColumn } from '@/core/tables/columns/DateColumn';"],
    ['TextColumn', "import { TextColumn } from '@/core/tables/columns/TextColumn';"],
    ['DateRangeFilter', "import { DateRangeFilter } from '@/core/tables/filters/DateRangeFilter';"],
    ['SelectFilter', "import { SelectFilter } from '@/core/tables/filters/SelectFilter';"],
    ['TernaryFilter', "import { TernaryFilter } from '@/core/tables/filters/TernaryFilter';"],
  ];

  const imports = IMPORTS.filter(([symbol]) => used.has(symbol)).map(([, line]) => line);

  const defaultSort = createdAt
    ? `\n\n    defaultSort: { column: '${createdAt.name}', direction: 'desc' },`
    : '';

  const filterBlock = filters.length ? `\n\n    filters: [\n${filters.join('\n')}\n    ],` : '';

  const source = `${imports.join('\n')}

// Generated by create-admin-panel from the \`${schema.name}\` table.
// Everything here is ordinary application code — edit it freely.
export const ${className}Resource = defineResource({
  name: '${schema.name}',
  model: '${singular}',
  route: '/${schema.name}',

  navigation: { label: '${plural}', icon: 'circle-dot', sort: 10 },
  labels: { singular: '${singular}', plural: '${plural}' },
  recordTitleKey: '${titleKey}',

  permissions: {
    viewAny: '${permissionKey}.view',
    view: '${permissionKey}.view',
    create: '${permissionKey}.create',
    update: '${permissionKey}.update',
    delete: '${permissionKey}.delete',
  },

  form: [
    Section.make('Details')
      .columns(2)
      .schema([
${fields.join('\n')}
      ]),
  ],

  table: {
    columns: [
${[...tableColumns, ...extraColumns].join('\n')}
    ],${filterBlock}

    actions: [ViewAction.make(), EditAction.make(), DeleteAction.make()],
    bulkActions: [DeleteBulkAction.make()],${defaultSort}

    emptyState: { heading: 'No ${plural.toLowerCase()} yet' },
  },
});
`;

  return { className, fileName: `${className}Resource.tsx`, source };
}

/**
 * A table with nothing editable (a pure join table, or one this generator could
 * not read) would emit a resource with an empty form, which fails to compile.
 */
export function isGeneratable(schema) {
  const { editable } = partition(schema);
  return editable.length > 0;
}

export async function generateResources(targetDir, schemas) {
  const schemasByName = new Map(schemas.map((schema) => [schema.name, schema]));
  const generated = [];
  const skipped = [];
  const seen = new Set();

  for (const schema of schemas) {
    if (!isGeneratable(schema)) {
      skipped.push(schema.name);
      continue;
    }

    const resource = generateResource(schema, schemasByName);

    // Two tables can singularize onto the same class name (`people`/`person`).
    if (seen.has(resource.className)) {
      skipped.push(schema.name);
      continue;
    }
    seen.add(resource.className);

    await writeFile(path.join(targetDir, 'src/resources', resource.fileName), resource.source);
    generated.push(resource.className);
  }

  return { generated, skipped };
}
