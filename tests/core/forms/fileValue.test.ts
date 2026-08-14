import { describe, expect, it } from 'vitest';
import {
  acceptedTypesFor,
  effectiveLayout,
  fileNameFromUrl,
  formatFileSize,
  looksLikeImage,
  matchesAcceptedType,
  toFileList,
} from '@/core/forms/fields/fileValue';

describe('toFileList', () => {
  it('wraps a single url', () => {
    expect(toFileList('/a.png')).toEqual(['/a.png']);
  });

  it('passes an array through', () => {
    expect(toFileList(['/a.png', '/b.png'])).toEqual(['/a.png', '/b.png']);
  });

  it('returns an empty list for null and empty string', () => {
    expect(toFileList(null)).toEqual([]);
    expect(toFileList('')).toEqual([]);
  });

  it('drops empty and non-string entries', () => {
    expect(toFileList(['/a.png', '', null as never, 3 as never])).toEqual(['/a.png']);
  });
});

describe('acceptedTypesFor', () => {
  it('is undefined when nothing is constrained', () => {
    expect(acceptedTypesFor({})).toBeUndefined();
  });

  it('defaults to images when imageOnly is set', () => {
    expect(acceptedTypesFor({ imageOnly: true })).toEqual(['image/*']);
  });

  it('prefers an explicit list over imageOnly', () => {
    expect(acceptedTypesFor({ imageOnly: true, acceptedFileTypes: ['.pdf'] })).toEqual(['.pdf']);
  });

  it('ignores an empty explicit list', () => {
    expect(acceptedTypesFor({ imageOnly: true, acceptedFileTypes: [] })).toEqual(['image/*']);
  });
});

function file(name: string, type: string): File {
  return new File(['x'], name, { type });
}

describe('matchesAcceptedType', () => {
  it('accepts anything when unconstrained', () => {
    expect(matchesAcceptedType(file('a.exe', 'application/x-msdownload'), {})).toBe(true);
  });

  it('matches a wildcard mime prefix', () => {
    expect(matchesAcceptedType(file('a.png', 'image/png'), { imageOnly: true })).toBe(true);
    expect(matchesAcceptedType(file('a.pdf', 'application/pdf'), { imageOnly: true })).toBe(false);
  });

  it('matches an exact mime type', () => {
    const config = { acceptedFileTypes: ['application/pdf'] };
    expect(matchesAcceptedType(file('a.pdf', 'application/pdf'), config)).toBe(true);
    expect(matchesAcceptedType(file('a.png', 'image/png'), config)).toBe(false);
  });

  it('matches an extension when the browser reports no mime type', () => {
    const config = { acceptedFileTypes: ['.csv'] };
    expect(matchesAcceptedType(file('report.csv', ''), config)).toBe(true);
    expect(matchesAcceptedType(file('report.txt', ''), config)).toBe(false);
  });

  it('is case-insensitive on both name and rule', () => {
    expect(
      matchesAcceptedType(file('PHOTO.PNG', 'IMAGE/PNG'), { acceptedFileTypes: ['.png'] }),
    ).toBe(true);
  });

  it('accepts a file matching any one of several rules', () => {
    const config = { acceptedFileTypes: ['.pdf', 'image/*'] };
    expect(matchesAcceptedType(file('a.png', 'image/png'), config)).toBe(true);
    expect(matchesAcceptedType(file('a.pdf', 'application/pdf'), config)).toBe(true);
    expect(matchesAcceptedType(file('a.zip', 'application/zip'), config)).toBe(false);
  });

  it('ignores a blank rule', () => {
    expect(matchesAcceptedType(file('a.png', 'image/png'), { acceptedFileTypes: ['  '] })).toBe(
      false,
    );
  });
});

describe('effectiveLayout', () => {
  it('defaults to a list', () => {
    expect(effectiveLayout({})).toBe('list');
  });

  it('uses a grid for previewable images', () => {
    expect(effectiveLayout({ imageOnly: true })).toBe('grid');
  });

  it('falls back to a list when previews are off', () => {
    expect(effectiveLayout({ imageOnly: true, previewable: false })).toBe('list');
  });

  it('respects an explicit layout', () => {
    expect(effectiveLayout({ imageOnly: true, panelLayout: 'list' })).toBe('list');
    expect(effectiveLayout({ panelLayout: 'grid' })).toBe('grid');
  });
});

describe('formatFileSize', () => {
  it.each([
    [0, '0 KB'],
    [512, '512 KB'],
    [1024, '1 MB'],
    [1536, '1.5 MB'],
    [1024 * 1024, '1 GB'],
    [1024 * 1024 * 2.5, '2.5 GB'],
  ])('formats %i KB as %s', (kilobytes, expected) => {
    expect(formatFileSize(kilobytes)).toBe(expected);
  });

  it('rounds to a whole number of kilobytes', () => {
    expect(formatFileSize(340.6)).toBe('341 KB');
  });
});

describe('fileNameFromUrl', () => {
  it('takes the last path segment', () => {
    expect(fileNameFromUrl('/uploads/2024/report.pdf')).toBe('report.pdf');
  });

  it('strips a query string and a hash', () => {
    expect(fileNameFromUrl('/a/report.pdf?v=2')).toBe('report.pdf');
    expect(fileNameFromUrl('/a/report.pdf#page=3')).toBe('report.pdf');
  });

  it('decodes percent-encoding', () => {
    expect(fileNameFromUrl('/a/my%20report.pdf')).toBe('my report.pdf');
  });

  it('survives a malformed escape sequence', () => {
    expect(fileNameFromUrl('/a/100%.pdf')).toBe('100%.pdf');
  });

  it('handles a bare file name', () => {
    expect(fileNameFromUrl('report.pdf')).toBe('report.pdf');
  });
});

describe('looksLikeImage', () => {
  it.each(['/a.png', '/a.JPG', '/a.jpeg', '/a.gif', '/a.webp', '/a.avif', '/a.svg'])(
    'recognises %s',
    (url) => {
      expect(looksLikeImage(url)).toBe(true);
    },
  );

  it.each(['/a.pdf', '/a.txt', '/a', '/png/report.doc'])('rejects %s', (url) => {
    expect(looksLikeImage(url)).toBe(false);
  });

  it('looks past a query string', () => {
    expect(looksLikeImage('/a.png?w=200')).toBe(true);
  });
});
