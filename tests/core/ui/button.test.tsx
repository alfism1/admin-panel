import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, buttonVariants } from '@/core/ui/button';

describe('<Button>', () => {
  it('renders its children', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('calls onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    await userEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not fire when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );

    await userEvent.click(screen.getByRole('button'));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('forwards arbitrary button attributes', () => {
    render(
      <Button type="submit" name="intent" value="save">
        Save
      </Button>,
    );

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('type', 'submit');
    expect(button).toHaveAttribute('name', 'intent');
  });

  it('merges a custom className with the variant classes', () => {
    render(<Button className="w-full">Save</Button>);
    expect(screen.getByRole('button')).toHaveClass('w-full');
  });

  it('forwards a ref', () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>Save</Button>);

    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});

describe('loading state', () => {
  it('disables the button and marks it busy', () => {
    render(<Button loading>Save</Button>);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('renders a spinner alongside the label', () => {
    const { container } = render(<Button loading>Save</Button>);

    expect(container.querySelector('svg')).toHaveClass('animate-spin');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('omits aria-busy when not loading', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy');
  });

  it('blocks clicks while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );

    await userEvent.click(screen.getByRole('button'));

    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('asChild', () => {
  it('renders the child element instead of a button', () => {
    render(
      <Button asChild>
        <a href="/users">Users</a>
      </Button>,
    );

    const link = screen.getByRole('link', { name: 'Users' });
    expect(link).toHaveAttribute('href', '/users');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('passes the variant classes onto the child', () => {
    render(
      <Button asChild variant="outline">
        <a href="/users">Users</a>
      </Button>,
    );

    expect(screen.getByRole('link')).toHaveClass('border');
  });

  it('omits the spinner in asChild mode, since Slot takes exactly one child', () => {
    const { container } = render(
      <Button asChild loading>
        <a href="/users">Users</a>
      </Button>,
    );

    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });
});

describe('buttonVariants', () => {
  it('defaults to a medium primary button', () => {
    const classes = buttonVariants();
    expect(classes).toContain('bg-primary');
    expect(classes).toContain('h-9');
  });

  it.each([
    'primary',
    'secondary',
    'success',
    'warning',
    'danger',
    'gray',
    'outline',
    'ghost',
    'link',
  ] as const)('produces distinct classes for the %s variant', (variant) => {
    expect(buttonVariants({ variant })).not.toBe('');
  });

  it.each(['sm', 'md', 'lg', 'icon', 'iconSm'] as const)('supports the %s size', (size) => {
    expect(buttonVariants({ size })).not.toBe('');
  });

  it('gives each variant a different class string', () => {
    expect(buttonVariants({ variant: 'danger' })).not.toBe(buttonVariants({ variant: 'ghost' }));
  });
});
