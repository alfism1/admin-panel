import { describe, expect, it } from 'vitest';
import { BadgeColumn } from '@/core/tables/columns/BadgeColumn';
import { BooleanColumn } from '@/core/tables/columns/BooleanColumn';
import { DateColumn } from '@/core/tables/columns/DateColumn';
import { ImageColumn } from '@/core/tables/columns/ImageColumn';
import { TextColumn } from '@/core/tables/columns/TextColumn';
import { makeTableContext } from '../../helpers/context';

describe('column immutability', () => {
  it('returns a new instance from every mutator', () => {
    const base = TextColumn.make('name');
    const sortable = base.sortable();

    expect(sortable).not.toBe(base);
    expect(base.definition.sortable).toBeUndefined();
    expect(sortable.definition.sortable).toBe(true);
  });

  it('keeps the subclass prototype', () => {
    expect(TextColumn.make('name').label('Name').badge()).toBeInstanceOf(TextColumn);
  });

  it('lets one base column be reused without cross-talk', () => {
    const shared = TextColumn.make('title');
    const a = shared.limit(20);
    const b = shared.weight('bold');

    expect(a.definition.weight).toBeUndefined();
    expect(b.definition.limit).toBeUndefined();
  });
});

describe('column labels', () => {
  it('falls back to a labelized name', () => {
    expect(TextColumn.make('first_name').resolveLabel()).toBe('First Name');
  });

  it('labels a dotted name by its leaf', () => {
    expect(TextColumn.make('role.name').resolveLabel()).toBe('Name');
  });

  it('prefers an explicit label', () => {
    expect(TextColumn.make('role.name').label('Role').resolveLabel()).toBe('Role');
  });
});

describe('sortable and searchable', () => {
  it('defaults to the column name', () => {
    const column = TextColumn.make('name').sortable().searchable();
    expect(column.definition.sortColumn).toBeUndefined();
    expect(column.definition.searchColumn).toBeUndefined();
  });

  it('accepts an overriding column', () => {
    const column = TextColumn.make('role.name')
      .sortable({ column: 'role_id' })
      .searchable({ column: 'roles.name' });

    expect(column.definition).toMatchObject({
      sortable: true,
      sortColumn: 'role_id',
      searchable: true,
      searchColumn: 'roles.name',
    });
  });

  it('sortable(false) turns it off', () => {
    expect(TextColumn.make('name').sortable().sortable(false).definition.sortable).toBe(false);
  });
});

describe('toggleable', () => {
  it('marks the column toggleable and visible by default', () => {
    const column = TextColumn.make('email').toggleable();
    expect(column.definition.toggleable).toBe(true);
    expect(column.definition.hiddenByDefault).toBeUndefined();
  });

  it('can start hidden', () => {
    const column = TextColumn.make('email').toggleable({ hiddenByDefault: true });
    expect(column.definition.hiddenByDefault).toBe(true);
  });
});

describe('isAllowed', () => {
  it('allows an ungated column', () => {
    expect(TextColumn.make('name').isAllowed(makeTableContext())).toBe(true);
  });

  it('checks the permission', () => {
    const column = TextColumn.make('salary').authorize('salary.view');

    expect(column.isAllowed(makeTableContext({ permissions: ['salary.view'] }))).toBe(true);
    expect(column.isAllowed(makeTableContext({ permissions: ['user.view'] }))).toBe(false);
  });

  it('honours a boolean visible flag', () => {
    expect(TextColumn.make('name').visible(false).isAllowed(makeTableContext())).toBe(false);
    expect(TextColumn.make('name').visible(true).isAllowed(makeTableContext())).toBe(true);
  });

  it('honours a visible predicate', () => {
    const column = TextColumn.make('name').visible((ctx) => ctx.user?.name === 'Ada Lovelace');

    expect(column.isAllowed(makeTableContext())).toBe(true);
    expect(column.isAllowed(makeTableContext({ user: null }))).toBe(false);
  });

  it('fails the permission check even when visible is true', () => {
    const column = TextColumn.make('salary').authorize('salary.view').visible(true);
    expect(column.isAllowed(makeTableContext({ permissions: [] }))).toBe(false);
  });
});

describe('presentation options', () => {
  it('stores alignment', () => {
    expect(TextColumn.make('a').alignStart().definition.align).toBe('start');
    expect(TextColumn.make('a').alignCenter().definition.align).toBe('center');
    expect(TextColumn.make('a').alignEnd().definition.align).toBe('end');
  });

  it('stores width and wrap', () => {
    const column = TextColumn.make('a').width('12rem').wrap();
    expect(column.definition.width).toBe('12rem');
    expect(column.definition.wrap).toBe(true);
  });

  it('stores fallback and placeholder text', () => {
    const column = TextColumn.make('a').default('—').placeholder('None');
    expect(column.definition.fallback).toBe('—');
    expect(column.definition.placeholder).toBe('None');
  });

  it('stores tooltip, url and click handlers', () => {
    const tooltip = () => 'tip';
    const url = () => '/somewhere';
    const onClick = () => undefined;
    const column = TextColumn.make('a')
      .tooltip(tooltip)
      .url(url, { openInNewTab: true })
      .action(onClick);

    expect(column.definition).toMatchObject({
      tooltip,
      urlResolver: url,
      openInNewTab: true,
      onClick,
    });
  });

  it('stores a custom cell and a state formatter', () => {
    const Custom = () => null;
    const format = () => 'x';
    const column = TextColumn.make('a').customComponent(Custom).formatStateUsing(format);

    expect(column.definition.custom).toBe(Custom);
    expect(column.definition.formatState).toBe(format);
  });
});

describe('TextColumn', () => {
  it('stores truncation, weight and tone', () => {
    const column = TextColumn.make('bio').limit(50).words(10).weight('bold').color('muted');
    expect(column.definition).toMatchObject({
      limit: 50,
      words: 10,
      weight: 'bold',
      tone: 'muted',
    });
  });

  it('stores affixes and copyable', () => {
    const column = TextColumn.make('n').prefix('$').suffix(' USD').copyable();
    expect(column.definition).toMatchObject({ prefix: '$', suffix: ' USD', copyable: true });
  });

  it('numeric() defaults to zero decimals', () => {
    expect(TextColumn.make('n').numeric().definition.numericDecimals).toBe(0);
    expect(TextColumn.make('n').numeric({ decimals: 2 }).definition.numericDecimals).toBe(2);
  });

  it('money() stores currency and locale', () => {
    expect(TextColumn.make('n').money('IDR', 'id-ID').definition.money).toEqual({
      currency: 'IDR',
      locale: 'id-ID',
    });
  });

  it('description() defaults to the below position', () => {
    const resolve = () => 'sub';
    expect(TextColumn.make('n').description(resolve).definition.description).toEqual({
      resolve,
      position: 'below',
    });
    expect(
      TextColumn.make('n').description(resolve, { position: 'above' }).definition.description,
    ).toMatchObject({ position: 'above' });
  });

  it('badge() flips the rendering mode and records the tone', () => {
    const column = TextColumn.make('status').badge('success');
    expect(column.definition.asBadge).toBe(true);
    expect(column.definition.badgeTone).toBe('success');
  });
});

describe('BadgeColumn', () => {
  it('stores a colour map', () => {
    const column = BadgeColumn.make('status').colors({ draft: 'gray', published: 'success' });
    expect(column.definition.colorMap).toEqual({ draft: 'gray', published: 'success' });
  });

  it('stores a colour function', () => {
    const fn = () => 'danger' as const;
    expect(BadgeColumn.make('status').colors(fn).definition.colorMap).toBe(fn);
  });

  it('stores an icon map', () => {
    const column = BadgeColumn.make('status').icons({ published: 'check' });
    expect(column.definition.iconMap).toEqual({ published: 'check' });
  });
});

describe('BooleanColumn', () => {
  it('centres itself by default', () => {
    expect(BooleanColumn.make('active').definition.align).toBe('center');
  });

  it('stores icons and tones for both states', () => {
    const column = BooleanColumn.make('active')
      .trueIcon('check')
      .falseIcon('x')
      .trueColor('success')
      .falseColor('danger');

    expect(column.definition).toMatchObject({
      trueIcon: 'check',
      falseIcon: 'x',
      trueTone: 'success',
      falseTone: 'danger',
    });
  });
});

describe('DateColumn', () => {
  it('defaults to a day-month-year format', () => {
    expect(DateColumn.make('created_at').definition.format).toBe('dd MMM yyyy');
  });

  it('dateFormat clears the relative flag', () => {
    const column = DateColumn.make('at').since().dateFormat('yyyy-MM-dd');
    expect(column.definition.format).toBe('yyyy-MM-dd');
    expect(column.definition.relative).toBe(false);
  });

  it('dateTimeFormat has a sensible default', () => {
    expect(DateColumn.make('at').dateTimeFormat().definition.format).toBe('dd MMM yyyy HH:mm');
  });

  it('since() switches to relative rendering', () => {
    expect(DateColumn.make('at').since().definition.relative).toBe(true);
  });

  it('stores a timezone', () => {
    expect(DateColumn.make('at').timezone('Asia/Jakarta').definition.timezone).toBe('Asia/Jakarta');
  });
});

describe('ImageColumn', () => {
  it('defaults to a 32px square', () => {
    expect(ImageColumn.make('avatar').definition).toMatchObject({ shape: 'square', size: 32 });
  });

  it('switches shape and size', () => {
    expect(ImageColumn.make('avatar').circular().size(48).definition).toMatchObject({
      shape: 'circle',
      size: 48,
    });
    expect(ImageColumn.make('a').circular().square().definition.shape).toBe('square');
  });

  it('stores stacked and a default image', () => {
    const column = ImageColumn.make('a').stacked().defaultImageUrl('/placeholder.png');
    expect(column.definition.stacked).toBe(true);
    expect(column.definition.defaultImageUrl).toBe('/placeholder.png');
  });
});
