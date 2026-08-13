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

/** Columns that must never leave the server, whatever the schema looks like. */
const SECRET_COLUMNS = new Set([
  'password',
  'password_hash',
  'passwordhash',
  'hashed_password',
  'remember_token',
  'api_token',
  'secret',
  'two_factor_secret',
  'two_factor_recovery_codes',
]);

export function isSecretColumn(name: string): boolean {
  return SECRET_COLUMNS.has(name.toLowerCase());
}

/** First present column used to label a related record in embedded output. */
export const DISPLAY_COLUMNS = ['name', 'title', 'label', 'slug', 'email', 'code'];
