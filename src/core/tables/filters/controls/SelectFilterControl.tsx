import { normalizeOptions } from '@/core/forms/fields/Select';
import { useRelationshipOptions } from '@/core/forms/controls/useRelationshipOptions';
import { Combobox } from '@/core/ui/combobox';
import type { SelectFilter } from '../SelectFilter';
import type { FilterRenderProps } from '../../types';

export function SelectFilterControl({ filter, value, onChange }: FilterRenderProps) {
  const config = (filter as SelectFilter).definition;
  const selected = value ? value.split(',') : [];

  const relationship = useRelationshipOptions(config.relationship, {
    preload: !config.searchable,
    selected,
  });

  const options = config.relationship
    ? relationship.options
    : normalizeOptions(config.options).map((option) => ({
        ...option,
        value: String(option.value),
      }));

  return (
    <Combobox
      options={options.map((option) => ({ ...option, value: String(option.value) }))}
      value={selected}
      onChange={(next) => onChange(next.join(','))}
      multiple={config.multiple}
      searchable={config.searchable}
      loading={relationship.loading}
      onSearch={config.searchable ? relationship.onSearch : undefined}
      placeholder={config.placeholder ?? `All ${filter.resolveLabel().toLowerCase()}`}
    />
  );
}
