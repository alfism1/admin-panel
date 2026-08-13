const ACRONYMS = new Set(['id', 'url', 'api', 'ip', 'sku', 'seo', 'html', 'pdf', 'uuid']);

/**
 * Convention-over-configuration label generator.
 * `first_name` -> `First Name`, `role.name` -> `Name`, `user_id` -> `User`.
 */
export function labelize(name: string): string {
  const leaf = name.split('.').pop() ?? name;

  const words = leaf
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  // Trailing `_id` is plumbing, not something a human needs to read.
  if (words.length > 1 && words[words.length - 1].toLowerCase() === 'id') {
    words.pop();
  }

  return words
    .map((word) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/** `users` -> `User` — used to name a record when a resource omits explicit labels. */
export function singularize(value: string): string {
  if (/ies$/i.test(value)) return value.replace(/ies$/i, 'y');
  if (/(s|sh|ch|x|z)es$/i.test(value)) return value.replace(/es$/i, '');
  if (/s$/i.test(value) && !/ss$/i.test(value)) return value.replace(/s$/i, '');
  return value;
}

export function pluralize(value: string): string {
  if (/y$/i.test(value) && !/[aeiou]y$/i.test(value)) return value.replace(/y$/i, 'ies');
  if (/(s|sh|ch|x|z)$/i.test(value)) return `${value}es`;
  if (/s$/i.test(value)) return value;
  return `${value}s`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}
