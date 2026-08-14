import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar, Badge, Card, Separator, Skeleton, Spinner, badgeVariants } from '@/core/ui/misc';

describe('<Badge>', () => {
  it('renders its children', () => {
    render(<Badge>Draft</Badge>);
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('defaults to the gray tone', () => {
    render(<Badge>Draft</Badge>);
    expect(screen.getByText('Draft')).toHaveClass('bg-muted');
  });

  it('applies the requested tone', () => {
    render(<Badge tone="success">Live</Badge>);
    expect(screen.getByText('Live')).toHaveClass('bg-success/12');
  });

  it('merges a custom className', () => {
    render(<Badge className="uppercase">Draft</Badge>);
    expect(screen.getByText('Draft')).toHaveClass('uppercase');
  });

  it('forwards span attributes', () => {
    render(<Badge title="Status">Draft</Badge>);
    expect(screen.getByText('Draft')).toHaveAttribute('title', 'Status');
  });
});

describe('badgeVariants', () => {
  it.each(['primary', 'secondary', 'success', 'warning', 'danger', 'info', 'gray'] as const)(
    'produces classes for the %s tone',
    (tone) => {
      expect(badgeVariants({ tone })).toContain('inline-flex');
    },
  );

  it('gives each tone a different class string', () => {
    expect(badgeVariants({ tone: 'danger' })).not.toBe(badgeVariants({ tone: 'success' }));
  });
});

describe('<Card>', () => {
  it('renders children inside a bordered surface', () => {
    render(<Card>Body</Card>);
    const card = screen.getByText('Body');

    expect(card).toHaveClass('rounded-xl', 'border');
  });

  it('merges a custom className', () => {
    render(<Card className="p-6">Body</Card>);
    expect(screen.getByText('Body')).toHaveClass('p-6');
  });
});

describe('<Skeleton>', () => {
  it('renders an animated placeholder', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    const skeleton = container.firstElementChild;

    expect(skeleton).toHaveClass('animate-pulse', 'h-4', 'w-20');
  });

  it('accepts inline styles for a computed width', () => {
    const { container } = render(<Skeleton style={{ width: '60%' }} />);
    expect(container.firstElementChild).toHaveStyle({ width: '60%' });
  });
});

describe('<Separator>', () => {
  it('is horizontal and decorative by default', () => {
    const { container } = render(<Separator />);
    const separator = container.firstElementChild;

    expect(separator).toHaveAttribute('data-orientation', 'horizontal');
    expect(separator).toHaveClass('h-px', 'w-full');
  });

  it('switches to a vertical rule', () => {
    const { container } = render(<Separator orientation="vertical" />);
    const separator = container.firstElementChild;

    expect(separator).toHaveAttribute('data-orientation', 'vertical');
    expect(separator).toHaveClass('w-px');
  });

  it('exposes a semantic role when not decorative', () => {
    render(<Separator decorative={false} />);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });
});

describe('<Avatar>', () => {
  it('shows the fallback initials when there is no source', () => {
    render(<Avatar fallback="AL" />);
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('shows the fallback while the image has not loaded', () => {
    render(<Avatar src="/ada.png" fallback="AL" />);
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('treats a null src as no source', () => {
    render(<Avatar src={null} fallback="AL" />);
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('merges a custom className onto the root', () => {
    const { container } = render(<Avatar fallback="AL" className="size-12" />);
    expect(container.firstElementChild).toHaveClass('size-12');
  });
});

describe('<Spinner>', () => {
  it('renders a decorative spinning svg', () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveClass('animate-spin');
    expect(svg).toHaveAttribute('aria-hidden');
  });

  it('merges a custom className', () => {
    const { container } = render(<Spinner className="size-8" />);
    expect(container.querySelector('svg')).toHaveClass('size-8');
  });
});
