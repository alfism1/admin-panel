import { Field, type FieldConfig } from '../Field';
import { collectFields } from '../formState';
import type { ResponsiveColumns } from '../layouts/Layout';
import type {
  FieldContext,
  FieldControl,
  FormComponent,
  FormValues,
  MaybeResolver,
  ValueType,
} from '../types';
import { labelize } from '@/lib/labelize';
import { getPath } from '@/lib/utils';
import { RepeaterControl } from '../controls/RepeaterControl';
import type { RepeaterAction, RepeaterActionModifier } from './RepeaterAction';
import { blankItemValue, issuesForItem } from './repeaterItems';

export type Alignment = 'start' | 'center' | 'end';

/**
 * Loads and saves items as rows of another resource, the way Filament's
 * `relationship()` maps a `HasMany`. Persistence happens at seam 1 — see
 * `src/resources/data/repeaterRelationships.ts`.
 */
export interface RepeaterRelationship {
  /** Child resource, as the API exposes it. */
  resource: string;
  /** Column on the child pointing back at the parent record. */
  foreignKey: string;
  /** Narrows which children belong to this repeater, beyond the foreign key. */
  filters?: Record<string, unknown>;
  sort?: { field: string; order: 'asc' | 'desc' };
  /** Page size used while loading children. Default 100. */
  perPage?: number;
}

export type RecordMutator = (data: FormValues) => FormValues;
export type RecordHook = (record: FormValues) => void;

/** One column of a table repeater; the nth column heads the nth child field. */
export interface RepeaterTableColumn {
  label: string;
  /** Any CSS grid track size. Defaults to an equal share of the row. */
  width?: string;
  align?: Alignment;
}

export type ItemLabelResolver = (item: FormValues, index: number) => string | null | undefined;

export interface RepeaterConfig extends FieldConfig {
  schema: FormComponent[];
  /** Set by `simple()`: the item is this field's scalar rather than an object. */
  simpleField?: Field;
  itemCount: number;
  /** False once `default()` is called, so an explicit default is never overwritten. */
  autoDefault: boolean;
  minItems?: number;
  maxItems?: number;
  addable?: MaybeResolver<boolean>;
  deletable?: MaybeResolver<boolean>;
  reorderable?: MaybeResolver<boolean>;
  cloneable?: MaybeResolver<boolean>;
  withButtons: boolean;
  withDragAndDrop: boolean;
  collapsible?: MaybeResolver<boolean>;
  collapsed?: MaybeResolver<boolean>;
  itemLabelResolver?: ItemLabelResolver;
  itemNumbers: boolean;
  addActionLabel?: string;
  addActionAlignment: Alignment;
  itemColumns?: number | ResponsiveColumns;
  tableColumns?: RepeaterTableColumn[];
  compact: boolean;
  orderColumn?: string;
  distinctNames: string[];
  fixIndistinct: boolean;
  extraItemActions: RepeaterAction[];
  addActionModifier?: RepeaterActionModifier;
  deleteActionModifier?: RepeaterActionModifier;
  cloneActionModifier?: RepeaterActionModifier;
  moveUpActionModifier?: RepeaterActionModifier;
  moveDownActionModifier?: RepeaterActionModifier;
  reorderActionModifier?: RepeaterActionModifier;
  collapseActionModifier?: RepeaterActionModifier;
  relationship?: RepeaterRelationship;
  mutateBeforeFill?: RecordMutator;
  mutateBeforeCreate?: RecordMutator;
  mutateBeforeSave?: RecordMutator;
  modifyRecords?: (records: FormValues[]) => FormValues[];
  afterCreate?: RecordHook;
  afterUpdate?: RecordHook;
  afterDelete?: RecordHook;
}

function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}

/**
 * SQLite and SQL Server hold JSON columns as text and the driver hands it back
 * unparsed, so an array field would arrive as a string. Overridable through the
 * usual `formatStateUsing()`.
 */
function parseArrayState(state: unknown): unknown {
  if (typeof state !== 'string') return state;
  try {
    const parsed: unknown = JSON.parse(state);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * A repeating group of fields, stored as an array on the record. Each item gets
 * its own copy of the schema bound to `name.index.child`, so `TextInput`,
 * `Select`, layouts and every resolver work inside an item exactly as they do
 * outside one.
 */
export class Repeater extends Field<unknown[], RepeaterConfig> {
  readonly valueType: ValueType = 'array';

  static make(name: string): Repeater {
    return new Repeater({
      name,
      validation: {},
      schema: [],
      itemCount: 1,
      autoDefault: true,
      withButtons: true,
      withDragAndDrop: true,
      itemNumbers: true,
      addActionAlignment: 'start',
      compact: false,
      distinctNames: [],
      fixIndistinct: false,
      extraItemActions: [],
      formatState: parseArrayState,
    }).seed();
  }

  get control(): FieldControl {
    return RepeaterControl as FieldControl;
  }

  /**
   * `buildDefaultValues` only sees the value captured on the builder, so the
   * blank items have to be re-expanded whenever the item shape changes.
   */
  private seed(): this {
    if (!this.config.autoDefault) return this;

    const { itemCount, schema, simpleField } = this.config;
    return this.mutate({
      defaultValue: (ctx: FieldContext) =>
        Array.from({ length: itemCount }, () => blankItemValue(schema, simpleField, ctx)),
    });
  }

  // ------------------------------------------------------------------ schema

  schema(components: FormComponent[]): this {
    return this.mutate({ schema: components }).seed();
  }

  /** One field per item, stored as a flat array of scalars. */
  simple(field: Field): this {
    return this.mutate({ simpleField: field, schema: [] }).seed();
  }

  default(value: MaybeResolver<unknown[]>): this {
    return super.default(value).mutate({ autoDefault: false });
  }

  defaultItems(count: number): this {
    return this.mutate({ itemCount: count, autoDefault: true }).seed();
  }

  // -------------------------------------------------------------- boundaries

  /** A positive minimum also makes the field required — an empty array cannot satisfy it. */
  minItems(count: number): this {
    const next = this.mutate({ minItems: count });
    return count > 0 ? next.required() : next;
  }

  maxItems(count: number): this {
    return this.mutate({ maxItems: count });
  }

  /** Rejects items that repeat a value for the named child field. */
  distinct(names: string | string[]): this {
    return this.mutate({ distinctNames: Array.isArray(names) ? names : [names] });
  }

  /**
   * Clears the losing copies instead of only reporting them: the item the user
   * just edited keeps the value and every other item holding it is reset.
   */
  fixIndistinctState(value = true): this {
    return this.mutate({ fixIndistinct: value });
  }

  // ----------------------------------------------------------------- actions

  addable(value: MaybeResolver<boolean> = true): this {
    return this.mutate({ addable: value });
  }

  deletable(value: MaybeResolver<boolean> = true): this {
    return this.mutate({ deletable: value });
  }

  cloneable(value: MaybeResolver<boolean> = true): this {
    return this.mutate({ cloneable: value });
  }

  reorderable(value: MaybeResolver<boolean> = true): this {
    return this.mutate({ reorderable: value });
  }

  reorderableWithButtons(value = true): this {
    return this.mutate({ withButtons: value });
  }

  reorderableWithDragAndDrop(value = true): this {
    return this.mutate({ withDragAndDrop: value });
  }

  addActionLabel(label: string): this {
    return this.mutate({ addActionLabel: label });
  }

  addActionAlignment(alignment: Alignment): this {
    return this.mutate({ addActionAlignment: alignment });
  }

  // --------------------------------------------------- action customisation

  /** Extra buttons in every item header, after the built-in controls. */
  extraItemActions(actions: RepeaterAction[]): this {
    return this.mutate({ extraItemActions: actions });
  }

  addAction(modify: RepeaterActionModifier): this {
    return this.mutate({ addActionModifier: modify });
  }

  deleteAction(modify: RepeaterActionModifier): this {
    return this.mutate({ deleteActionModifier: modify });
  }

  cloneAction(modify: RepeaterActionModifier): this {
    return this.mutate({ cloneActionModifier: modify });
  }

  moveUpAction(modify: RepeaterActionModifier): this {
    return this.mutate({ moveUpActionModifier: modify });
  }

  moveDownAction(modify: RepeaterActionModifier): this {
    return this.mutate({ moveDownActionModifier: modify });
  }

  /** The drag handle. */
  reorderAction(modify: RepeaterActionModifier): this {
    return this.mutate({ reorderActionModifier: modify });
  }

  collapseAction(modify: RepeaterActionModifier): this {
    return this.mutate({ collapseActionModifier: modify });
  }

  // ---------------------------------------------------------------- presence

  collapsible(value: MaybeResolver<boolean> = true): this {
    return this.mutate({ collapsible: value });
  }

  /** Implies `collapsible()`: items start folded but can still be opened. */
  collapsed(value: MaybeResolver<boolean> = true): this {
    return this.mutate({ collapsed: value, collapsible: true });
  }

  itemLabel(resolver: ItemLabelResolver): this {
    return this.mutate({ itemLabelResolver: resolver });
  }

  itemNumbers(value = true): this {
    return this.mutate({ itemNumbers: value });
  }

  /** Lays each item's fields out in columns, like `Grid`. */
  grid(columns: number | ResponsiveColumns): this {
    return this.mutate({ itemColumns: columns });
  }

  /** Renders items as rows under a shared header instead of as cards. */
  table(columns: RepeaterTableColumn[]): this {
    return this.mutate({ tableColumns: columns });
  }

  compact(value = true): this {
    return this.mutate({ compact: value });
  }

  // ----------------------------------------------------------- relationship

  /**
   * Backs the items with rows of another resource instead of a column on this
   * one. Requires `withRepeaterRelationships()` to be the active data provider.
   */
  relationship(options: RepeaterRelationship): this {
    return this.mutate({ relationship: options });
  }

  /** Runs on each loaded child before it becomes an item. */
  mutateRelationshipDataBeforeFillUsing(fn: RecordMutator): this {
    return this.mutate({ mutateBeforeFill: fn });
  }

  /** Runs on an item before it is inserted as a new child. */
  mutateRelationshipDataBeforeCreateUsing(fn: RecordMutator): this {
    return this.mutate({ mutateBeforeCreate: fn });
  }

  /** Runs on an item before an existing child is updated. */
  mutateRelationshipDataBeforeSaveUsing(fn: RecordMutator): this {
    return this.mutate({ mutateBeforeSave: fn });
  }

  /** Filters or reorders the loaded children before they are filled in. */
  modifyRecordsUsing(fn: (records: FormValues[]) => FormValues[]): this {
    return this.mutate({ modifyRecords: fn });
  }

  afterCreate(fn: RecordHook): this {
    return this.mutate({ afterCreate: fn });
  }

  afterUpdate(fn: RecordHook): this {
    return this.mutate({ afterUpdate: fn });
  }

  afterDelete(fn: RecordHook): this {
    return this.mutate({ afterDelete: fn });
  }

  // ------------------------------------------------------------------ output

  /** Writes each item's position into the named key on submit. */
  orderColumn(column: string): this {
    return this.mutate({
      orderColumn: column,
      dehydrateState: (state: unknown) =>
        (Array.isArray(state) ? state : []).map((item: FormValues, index: number) => ({
          ...item,
          [column]: index,
        })),
    });
  }

  // -------------------------------------------------------------- validation

  /**
   * Item counts and duplicates are reported in full. Per-field problems inside
   * an item are summarised here — `buildZodSchema` can only attach an issue to
   * this field's own path — and spelled out next to the offending item by
   * `RepeaterControl`.
   */
  validate(value: unknown, ctx: FieldContext, label: string): string[] {
    const items = Array.isArray(value) ? value : [];
    const { minItems, maxItems, schema, simpleField, name } = this.config;
    const messages: string[] = [];

    if (minItems !== undefined && items.length < minItems) {
      messages.push(`${label} needs at least ${minItems} ${plural(minItems, 'item')}.`);
    }
    if (maxItems !== undefined && items.length > maxItems) {
      messages.push(`${label} accepts at most ${maxItems} ${plural(maxItems, 'item')}.`);
    }

    messages.push(...this.duplicateMessages(items, ctx));

    const failing = items.filter(
      (_item, index) => issuesForItem(schema, simpleField, name, ctx, index).length > 0,
    ).length;

    if (failing > 0) {
      messages.push(
        `${failing} ${plural(failing, 'item')} ${failing === 1 ? 'needs' : 'need'} attention.`,
      );
    }

    return messages;
  }

  private duplicateMessages(items: unknown[], ctx: FieldContext): string[] {
    const fields = collectFields(this.config.schema);
    const messages: string[] = [];

    for (const target of this.config.distinctNames) {
      const seen = new Set<string>();
      let duplicated = false;

      for (const item of items) {
        const key = String(getPath(item as FormValues, target) ?? '');
        if (key === '') continue;
        if (seen.has(key)) duplicated = true;
        seen.add(key);
      }

      if (!duplicated) continue;

      const field = fields.find((candidate) => candidate.name === target);
      const label = field ? field.resolveLabel(ctx) : labelize(target);
      messages.push(`${label} must be unique across items.`);
    }

    return messages;
  }
}
