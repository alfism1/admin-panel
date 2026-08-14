#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const RESOURCES_DIR = path.resolve('src/resources');
const INDEX_FILE = path.join(RESOURCES_DIR, 'index.ts');

function toPascalCase(value) {
  return value
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

function toSnakeCase(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toLowerCase();
}

function pluralize(value) {
  if (/y$/i.test(value) && !/[aeiou]y$/i.test(value)) return value.replace(/y$/i, 'ies');
  if (/(s|sh|ch|x|z)$/i.test(value)) return `${value}es`;
  if (/s$/i.test(value)) return value;
  return `${value}s`;
}

function template({ className, singular, plural, resourceKey, permissionKey }) {
  return `import { DeleteBulkAction } from '@/core/actions/BulkAction';
import { DeleteAction } from '@/core/actions/DeleteAction';
import { EditAction } from '@/core/actions/EditAction';
import { ViewAction } from '@/core/actions/ViewAction';
import { TextInput } from '@/core/forms/fields/TextInput';
import { Textarea } from '@/core/forms/fields/Textarea';
import { Toggle } from '@/core/forms/fields/Toggle';
import { Section } from '@/core/forms/layouts/Section';
import { defineResource } from '@/core/resources/Resource';
import { BooleanColumn } from '@/core/tables/columns/BooleanColumn';
import { DateColumn } from '@/core/tables/columns/DateColumn';
import { TextColumn } from '@/core/tables/columns/TextColumn';
import { TernaryFilter } from '@/core/tables/filters/TernaryFilter';

export const ${className}Resource = defineResource({
  name: '${resourceKey}',
  model: '${singular}',
  route: '/${resourceKey}',

  navigation: { label: '${plural}', icon: 'circle-dot', sort: 10 },
  labels: { singular: '${singular}', plural: '${plural}' },
  recordTitleKey: 'name',

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
        TextInput.make('name').required().maxLength(255).autofocus(),
        Toggle.make('is_active').label('Active').default(true),
        Textarea.make('description').rows(3).maxLength(500).columnSpanFull(),
      ]),
  ],

  table: {
    columns: [
      TextColumn.make('name').searchable().sortable().weight('semibold'),
      BooleanColumn.make('is_active').label('Active').sortable(),
      DateColumn.make('created_at').label('Created').since().sortable().toggleable(),
    ],

    filters: [TernaryFilter.make('is_active').label('Status')],

    actions: [ViewAction.make(), EditAction.make(), DeleteAction.make()],
    bulkActions: [DeleteBulkAction.make()],

    defaultSort: { column: 'created_at', direction: 'desc' },
    emptyState: { heading: 'No ${plural.toLowerCase()} yet' },
  },
});
`;
}

async function registerInIndex(className) {
  const source = await readFile(INDEX_FILE, 'utf8');
  if (source.includes(`${className}Resource`)) return false;

  const importLine = `import { ${className}Resource } from './${className}Resource';`;
  const withImport = source.replace(/(import \{ registerResources \}.*\n)/, `$1${importLine}\n`);

  const withRegistration = withImport.replace(
    /registerResources\(\[([^\]]*)\]\)/,
    (_match, list) => `registerResources([${list.trim().replace(/,$/, '')}, ${className}Resource])`,
  );

  await writeFile(INDEX_FILE, withRegistration);
  return true;
}

async function main() {
  const [name] = process.argv.slice(2);

  if (!name) {
    console.error('Usage: pnpm gen:resource <Name>   e.g. pnpm gen:resource Product');
    process.exit(1);
  }

  const className = toPascalCase(name);
  const singular = className.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  const plural = pluralize(singular);
  const resourceKey = pluralize(toSnakeCase(className));
  const permissionKey = toSnakeCase(className);

  const filePath = path.join(RESOURCES_DIR, `${className}Resource.tsx`);
  if (existsSync(filePath)) {
    console.error(`✗ ${path.relative(process.cwd(), filePath)} already exists.`);
    process.exit(1);
  }

  await writeFile(filePath, template({ className, singular, plural, resourceKey, permissionKey }));
  const registered = await registerInIndex(className);

  console.log(`✓ Created ${path.relative(process.cwd(), filePath)}`);
  console.log(
    registered
      ? `✓ Registered ${className}Resource in src/resources/index.ts`
      : `! Add ${className}Resource to src/resources/index.ts manually`,
  );
  console.log(
    `\nRoutes now available: /${resourceKey}, /${resourceKey}/create, /${resourceKey}/:id, /${resourceKey}/:id/edit`,
  );
  console.log(
    `Permissions expected from the API: ${permissionKey}.view, .create, .update, .delete`,
  );
}

await main();
