import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { downloadCsv, toCsv, type CsvColumn } from '@/lib/csv';

const columns: CsvColumn[] = [
  { key: 'id', header: 'ID' },
  { key: 'title', header: 'Title' },
];

const lines = (csv: string) => csv.split('\r\n');

describe('toCsv', () => {
  it('writes the headers first, then one CRLF-separated line per row', () => {
    const csv = toCsv(
      [
        { id: 1, title: 'Hello' },
        { id: 2, title: 'World' },
      ],
      columns,
    );

    expect(lines(csv)).toEqual(['ID,Title', '1,Hello', '2,World']);
  });

  it('writes only the header row when there is nothing to export', () => {
    expect(toCsv([], columns)).toBe('ID,Title');
  });

  it('reads dot-notation out of an embedded record', () => {
    const csv = toCsv([{ author: { name: 'Ada' } }], [{ key: 'author.name', header: 'Author' }]);

    expect(lines(csv)[1]).toBe('Ada');
  });

  it('leaves a missing value empty rather than writing "undefined"', () => {
    const csv = toCsv([{ id: 1, title: null }, {}], columns);

    expect(lines(csv).slice(1)).toEqual(['1,', ',']);
  });

  it('serialises dates as ISO strings and objects as JSON', () => {
    const csv = toCsv(
      [{ at: new Date('2026-08-20T10:00:00.000Z'), meta: { tags: ['a'] } }],
      [
        { key: 'at', header: 'At' },
        { key: 'meta', header: 'Meta' },
      ],
    );

    expect(lines(csv)[1]).toBe('2026-08-20T10:00:00.000Z,"{""tags"":[""a""]}"');
  });

  it('quotes a cell containing the delimiter, a quote or a newline', () => {
    const csv = toCsv([{ id: 'a,b', title: 'He said "hi"\nagain' }], columns);

    expect(lines(csv)[1]).toBe('"a,b","He said ""hi""\nagain"');
  });

  it('honours a custom delimiter, and stops quoting on the comma', () => {
    const csv = toCsv([{ id: 'a,b', title: 'x' }], columns, ';');

    expect(lines(csv)).toEqual(['ID;Title', 'a,b;x']);
  });

  it('neutralises a cell a spreadsheet would run as a formula', () => {
    const csv = toCsv([{ id: '=SUM(A1:A9)', title: '@user' }], columns);

    expect(lines(csv)[1]).toBe("'=SUM(A1:A9),'@user");
  });

  it('leaves a negative number alone, since a number is never a formula', () => {
    const csv = toCsv([{ id: -5, title: 'x' }], columns);

    expect(lines(csv)[1]).toBe('-5,x');
  });
});

describe('downloadCsv', () => {
  let click: MockInstance;

  beforeEach(() => {
    // jsdom would try to navigate to the blob URL and log "not implemented".
    click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  it('clicks a download link for the file and cleans up after itself', () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:csv');
    const revoke = vi.spyOn(URL, 'revokeObjectURL');

    downloadCsv('posts.csv', 'ID,Title');

    expect(create).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    const link = click.mock.instances[0] as HTMLAnchorElement;
    expect(link.download).toBe('posts.csv');
    expect(link.href).toBe('blob:csv');
    expect(revoke).toHaveBeenCalledWith('blob:csv');
    expect(document.querySelector('a')).toBeNull();
  });

  it('sends the content as a text/csv blob', async () => {
    let blob: Blob | undefined;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((source) => {
      blob = source as Blob;
      return 'blob:csv';
    });

    downloadCsv('posts.csv', 'ID,Title\r\n1,Hello');

    expect(blob?.type).toBe('text/csv;charset=utf-8');
    // jsdom's Blob has no `text()`, so the content is read the long way round.
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob as Blob);
    });
    expect(text).toBe('ID,Title\r\n1,Hello');
  });
});
