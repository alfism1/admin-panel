import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
// Explicit extension, deliberately: `src/core/auth/` holds both `Can.tsx` (this
// component) and `can.ts` (the permission checker). On a case-insensitive
// filesystem — the macOS default — Vite tries `Can.ts` before `Can.tsx` and
// silently resolves the extensionless specifier to `can.ts`, whose `Can` export
// does not exist. Nothing in `src/` imports this component today, so the clash
// has never surfaced outside these tests.
import { Can } from '@/core/auth/Can.tsx';
import { makeUser } from '../../helpers/context';
import { renderWithProviders } from '../../helpers/render';

const reader = makeUser({ permissions: ['user.view', 'post.view'] });

describe('<Can>', () => {
  it('renders children when the permission is granted', () => {
    renderWithProviders(
      <Can permission="user.view">
        <span>secret</span>
      </Can>,
      { user: reader },
    );

    expect(screen.getByText('secret')).toBeInTheDocument();
  });

  it('renders nothing when the permission is missing', () => {
    renderWithProviders(
      <Can permission="user.delete">
        <span>secret</span>
      </Can>,
      { user: reader },
    );

    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('renders the fallback instead when denied', () => {
    renderWithProviders(
      <Can permission="user.delete" fallback={<span>denied</span>}>
        <span>secret</span>
      </Can>,
      { user: reader },
    );

    expect(screen.getByText('denied')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('defaults to requiring every permission in a list', () => {
    renderWithProviders(
      <Can permission={['user.view', 'user.delete']}>
        <span>secret</span>
      </Can>,
      { user: reader },
    );

    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('mode="any" passes when one permission matches', () => {
    renderWithProviders(
      <Can permission={['user.delete', 'user.view']} mode="any">
        <span>secret</span>
      </Can>,
      { user: reader },
    );

    expect(screen.getByText('secret')).toBeInTheDocument();
  });

  it('renders for a wildcard grant', () => {
    renderWithProviders(
      <Can permission="user.delete">
        <span>secret</span>
      </Can>,
      { user: makeUser({ permissions: ['user.*'] }) },
    );

    expect(screen.getByText('secret')).toBeInTheDocument();
  });

  it('hides everything from a user with no permissions', () => {
    renderWithProviders(
      <Can permission="user.view">
        <span>secret</span>
      </Can>,
      { user: makeUser({ permissions: [] }) },
    );

    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });
});
