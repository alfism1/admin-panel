import { render } from '@testing-library/react';
import { Star } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { Icon, iconRegistry, resolveIcon } from '@/core/ui/icon';

describe('resolveIcon', () => {
  it('resolves a registry key to its component', () => {
    expect(resolveIcon('users')).toBe(iconRegistry.users);
  });

  it('resolves a hyphenated key', () => {
    expect(resolveIcon('check-circle')).toBe(iconRegistry['check-circle']);
  });

  it('passes a component through unchanged, so a resource can use any Lucide icon', () => {
    expect(resolveIcon(Star)).toBe(Star);
  });

  it('returns null for undefined', () => {
    expect(resolveIcon(undefined)).toBeNull();
  });

  it('returns null for an unknown key rather than throwing', () => {
    expect(resolveIcon('no-such-icon' as never)).toBeNull();
  });

  it('resolves every key in the registry', () => {
    const unresolved = Object.keys(iconRegistry).filter(
      (name) => resolveIcon(name as keyof typeof iconRegistry) === null,
    );
    expect(unresolved).toEqual([]);
  });
});

describe('<Icon>', () => {
  it('renders an svg for a registry key', () => {
    const { container } = render(<Icon name="users" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders nothing when no name is given', () => {
    const { container } = render(<Icon name={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an unknown name', () => {
    const { container } = render(<Icon name={'no-such-icon' as never} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is hidden from assistive tech, since icons here are always decorative', () => {
    const { container } = render(<Icon name="users" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden');
  });

  it('forwards a className', () => {
    const { container } = render(<Icon name="users" className="size-3" />);
    expect(container.querySelector('svg')).toHaveClass('size-3');
  });

  it('renders a component passed directly', () => {
    const { container } = render(<Icon name={Star} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
