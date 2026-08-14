import { describe, expect, it } from 'vitest';
import { DateRangeFilter } from '@/core/tables/filters/DateRangeFilter';
import { SelectFilter } from '@/core/tables/filters/SelectFilter';
import { TernaryFilter } from '@/core/tables/filters/TernaryFilter';

describe('filter basics', () => {
  it('is immutable across mutators', () => {
    const base = SelectFilter.make('status');
    const labelled = base.label('State');

    expect(labelled).not.toBe(base);
    expect(base.definition.label).toBeUndefined();
    expect(labelled).toBeInstanceOf(SelectFilter);
  });

  it('falls back to a labelized name', () => {
    expect(SelectFilter.make('is_active').resolveLabel()).toBe('Is Active');
  });

  it('prefers an explicit label', () => {
    expect(SelectFilter.make('is_active').label('Active').resolveLabel()).toBe('Active');
  });

  it('stores a placeholder and a permission', () => {
    const filter = SelectFilter.make('status').placeholder('Any').authorize('post.filter');
    expect(filter.definition.placeholder).toBe('Any');
    expect(filter.definition.authorization).toBe('post.filter');
  });

  it('treats only the empty string as empty', () => {
    const filter = SelectFilter.make('status');
    expect(filter.isEmpty('')).toBe(true);
    expect(filter.isEmpty('draft')).toBe(false);
  });

  it('passes the raw value to the query by default', () => {
    expect(SelectFilter.make('status').toQuery('draft')).toBe('draft');
  });
});

describe('SelectFilter', () => {
  const filter = SelectFilter.make('status').options({
    draft: 'Draft',
    published: 'Published',
    archived: 'Archived',
  });

  it('stores options, multiple and searchable', () => {
    const configured = SelectFilter.make('status').options({ a: 'A' }).multiple().searchable();
    expect(configured.definition).toMatchObject({
      options: { a: 'A' },
      multiple: true,
      searchable: true,
    });
  });

  it('relationship() implies searchable', () => {
    const configured = SelectFilter.make('author_id').relationship({
      resource: 'users',
      titleKey: 'name',
    });

    expect(configured.definition.relationship).toEqual({ resource: 'users', titleKey: 'name' });
    expect(configured.definition.searchable).toBe(true);
  });

  it('describes a single selection by its label', () => {
    expect(filter.describe('draft')).toBe('Draft');
  });

  it('describes two selections as a list', () => {
    expect(filter.describe('draft,published')).toBe('Draft, Published');
  });

  it('collapses three or more selections to a count', () => {
    expect(filter.describe('draft,published,archived')).toBe('3 selected');
  });

  it('falls back to the raw value when no option matches', () => {
    expect(filter.describe('unknown')).toBe('unknown');
  });

  it('describes an empty value as an empty string', () => {
    expect(filter.describe('')).toBe('');
  });

  it('describes numeric option values', () => {
    const numeric = SelectFilter.make('role').options([{ value: 1, label: 'Admin' }]);
    expect(numeric.describe('1')).toBe('Admin');
  });
});

describe('TernaryFilter', () => {
  it('ships with any/yes/no labels', () => {
    expect(TernaryFilter.make('is_active').definition).toMatchObject({
      trueLabel: 'Yes',
      falseLabel: 'No',
      blankLabel: 'All',
    });
  });

  it('accepts custom labels', () => {
    const filter = TernaryFilter.make('is_active')
      .trueLabel('Active')
      .falseLabel('Suspended')
      .blankLabel('Everyone');

    expect(filter.definition).toMatchObject({
      trueLabel: 'Active',
      falseLabel: 'Suspended',
      blankLabel: 'Everyone',
    });
  });

  it('describes true and false with the configured labels', () => {
    const filter = TernaryFilter.make('is_active').trueLabel('Active').falseLabel('Suspended');
    expect(filter.describe('true')).toBe('Active');
    expect(filter.describe('false')).toBe('Suspended');
  });
});

describe('DateRangeFilter', () => {
  const filter = DateRangeFilter.make('created_at');

  it('stores the time flag', () => {
    expect(DateRangeFilter.make('at').time().definition.withTime).toBe(true);
  });

  it('treats both empty and a bare separator as empty', () => {
    expect(filter.isEmpty('')).toBe(true);
    expect(filter.isEmpty('..')).toBe(true);
  });

  it('is not empty when either side is set', () => {
    expect(filter.isEmpty('2024-01-01..')).toBe(false);
    expect(filter.isEmpty('..2024-01-31')).toBe(false);
  });

  it('describes a closed range with an arrow', () => {
    expect(filter.describe('2024-01-01..2024-01-31')).toBe('2024-01-01 → 2024-01-31');
  });

  it('describes an open-ended range', () => {
    expect(filter.describe('2024-01-01..')).toBe('after 2024-01-01');
    expect(filter.describe('..2024-01-31')).toBe('before 2024-01-31');
  });
});
