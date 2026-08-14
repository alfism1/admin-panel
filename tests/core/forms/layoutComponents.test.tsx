import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TextInput } from '@/core/forms/fields/TextInput';
import { Grid } from '@/core/forms/layouts/Grid';
import { Section } from '@/core/forms/layouts/Section';
import { Tab, Tabs } from '@/core/forms/layouts/Tabs';
import { TabPanelComponent } from '@/core/forms/layouts/TabsComponent';
import { SchemaForm } from '@/core/forms/SchemaForm';
import type { FormComponent } from '@/core/forms/types';
import { Tabs as TabsRoot, TabsContent, TabsList, TabsTrigger } from '@/core/ui/tabs';
import { renderWithProviders } from '../../helpers/render';

/**
 * Layouts render their children themselves, so they are driven through a real
 * `SchemaForm` — mounting one bare would skip the renderer that feeds them a
 * context and a `renderComponents` callback.
 */
function renderLayout(schema: FormComponent[], operation: 'create' | 'edit' | 'view' = 'create') {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  return {
    onSubmit,
    ...renderWithProviders(
      <SchemaForm schema={schema} operation={operation} onSubmit={onSubmit} />,
    ),
  };
}

describe('TabsComponent', () => {
  const twoTabs = () =>
    Tabs.make('post-tabs').tabs([
      Tab.make('Content')
        .icon('file-text')
        .schema([TextInput.make('title')]),
      Tab.make('Meta').schema([TextInput.make('slug')]),
    ]);

  it('renders one trigger per tab', () => {
    renderLayout([twoTabs()]);

    expect(screen.getByRole('tab', { name: 'Content' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Meta' })).toBeInTheDocument();
  });

  it('selects the first tab and hides the rest', () => {
    renderLayout([twoTabs()]);

    expect(screen.getByRole('tab', { name: 'Content' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Meta' })).toHaveAttribute('aria-selected', 'false');
  });

  it('keeps every panel mounted so hidden fields still submit', () => {
    renderLayout([twoTabs()]);

    // `forceMount` means the inactive panel's input exists but is hidden.
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByLabelText('Slug')).toBeInTheDocument();
  });

  it('switches the visible panel when another tab is clicked', async () => {
    renderLayout([twoTabs()]);

    await userEvent.click(screen.getByRole('tab', { name: 'Meta' }));

    expect(screen.getByRole('tab', { name: 'Meta' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Content' })).toHaveAttribute('aria-selected', 'false');
  });

  it('renders the icon a tab was given', () => {
    const { container } = renderLayout([twoTabs()]);

    const contentTrigger = screen.getByRole('tab', { name: 'Content' });
    expect(contentTrigger.querySelector('svg')).toBeInTheDocument();
    expect(container).toBeInTheDocument();
  });

  it('drops tabs whose gate is closed', () => {
    renderLayout([
      Tabs.make().tabs([
        Tab.make('Content').schema([TextInput.make('title')]),
        Tab.make('Danger')
          .hidden()
          .schema([TextInput.make('secret')]),
      ]),
    ]);

    expect(screen.getByRole('tab', { name: 'Content' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Danger' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Secret')).not.toBeInTheDocument();
  });

  it('drops tabs the user is not authorized for', () => {
    renderLayout([
      Tabs.make().tabs([
        Tab.make('Content').schema([TextInput.make('title')]),
        Tab.make('Admin')
          .authorize('posts.admin')
          .schema([TextInput.make('secret')]),
      ]),
    ]);

    expect(screen.getByRole('tab', { name: 'Content' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Admin' })).toBeInTheDocument();
  });

  it('hides an unauthorized tab from a user without the permission', () => {
    renderWithProviders(
      <SchemaForm
        schema={[
          Tabs.make().tabs([
            Tab.make('Content').schema([TextInput.make('title')]),
            Tab.make('Admin')
              .authorize('posts.admin')
              .schema([TextInput.make('secret')]),
          ]),
        ]}
        operation="create"
        onSubmit={vi.fn()}
      />,
      { permissions: ['posts.view'] },
    );

    expect(screen.queryByRole('tab', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('renders nothing when every tab is gated out', () => {
    renderLayout([
      Tabs.make().tabs([
        Tab.make('One')
          .hidden()
          .schema([TextInput.make('a')]),
        Tab.make('Two')
          .hidden()
          .schema([TextInput.make('b')]),
      ]),
    ]);

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('renders nothing when the tabs list is empty', () => {
    renderLayout([Tabs.make()]);

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('falls back to the first tab when the selected one disappears', async () => {
    // The second tab is only visible while `title` is empty; typing removes it
    // and the panel must fall back rather than render an empty selection.
    renderLayout([
      Tabs.make().tabs([
        Tab.make('Content').schema([TextInput.make('title')]),
        Tab.make('Extra')
          .hidden((ctx) => Boolean(ctx.get('title')))
          .schema([TextInput.make('note')]),
      ]),
    ]);

    await userEvent.click(screen.getByRole('tab', { name: 'Extra' }));
    expect(screen.getByRole('tab', { name: 'Extra' })).toHaveAttribute('aria-selected', 'true');

    await userEvent.type(screen.getByLabelText('Title'), 'x');

    expect(screen.queryByRole('tab', { name: 'Extra' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Content' })).toHaveAttribute('aria-selected', 'true');
  });

  it('lays a tab panel out on its configured column count', () => {
    const { container } = renderLayout([
      Tabs.make().tabs([
        Tab.make('Content')
          .columns(2)
          .schema([TextInput.make('title')]),
      ]),
    ]);

    expect(container.querySelector('.sm\\:grid-cols-2')).toBeInTheDocument();
  });
});

describe('TabPanelComponent', () => {
  it('renders a Tab used outside a Tabs container as a plain grid', () => {
    renderLayout([
      Tab.make('Solo')
        .columns(2)
        .schema([TextInput.make('title')]),
    ]);

    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('is the component a bare Tab resolves to', () => {
    expect(Tab.make('Solo').component).toBe(TabPanelComponent);
  });
});

describe('SectionComponent', () => {
  it('renders its heading and children', () => {
    renderLayout([Section.make('Profile').schema([TextInput.make('name')])]);

    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('renders a static description', () => {
    renderLayout([
      Section.make('Profile')
        .description('Who they are')
        .schema([TextInput.make('name')]),
    ]);

    expect(screen.getByText('Who they are')).toBeInTheDocument();
  });

  it('resolves a description from the form context', () => {
    renderLayout(
      [
        Section.make('Profile')
          .description((ctx) => `Mode: ${ctx.operation}`)
          .schema([TextInput.make('name')]),
      ],
      'edit',
    );

    expect(screen.getByText('Mode: edit')).toBeInTheDocument();
  });

  it('renders no description paragraph when none was given', () => {
    const { container } = renderLayout([Section.make('Profile').schema([TextInput.make('name')])]);

    expect(container.querySelector('p.text-muted-foreground')).not.toBeInTheDocument();
  });

  it('shows no toggle button when it is not collapsible', () => {
    renderLayout([Section.make('Profile').schema([TextInput.make('name')])]);

    expect(screen.queryByRole('button', { name: /section/i })).not.toBeInTheDocument();
  });

  it('starts expanded when only collapsible', () => {
    renderLayout([
      Section.make('Profile')
        .collapsible()
        .schema([TextInput.make('name')]),
    ]);

    const toggle = screen.getByRole('button', { name: 'Collapse section' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('starts collapsed when configured that way', () => {
    renderLayout([
      Section.make('Profile')
        .collapsed()
        .schema([TextInput.make('name')]),
    ]);

    expect(screen.getByRole('button', { name: 'Expand section' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('toggles the body open and shut', async () => {
    renderLayout([
      Section.make('Profile')
        .collapsible()
        .schema([TextInput.make('name')]),
    ]);

    const toggle = screen.getByRole('button', { name: 'Collapse section' });
    const bodyId = toggle.getAttribute('aria-controls');
    const body = document.getElementById(bodyId as string);

    expect(body).not.toHaveAttribute('hidden');

    await userEvent.click(toggle);
    expect(body).toHaveAttribute('hidden');
    expect(screen.getByRole('button', { name: 'Expand section' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Expand section' }));
    expect(body).not.toHaveAttribute('hidden');
  });

  it('keeps a collapsed body mounted so its fields still submit', () => {
    renderLayout([
      Section.make('Profile')
        .collapsed()
        .schema([TextInput.make('name')]),
    ]);

    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('renders the aside variant with the heading in its own column', () => {
    const { container } = renderLayout([
      Section.make('Profile')
        .aside()
        .schema([TextInput.make('name')]),
    ]);

    expect(container.querySelector('.md\\:grid-cols-3')).toBeInTheDocument();
    expect(container.querySelector('.md\\:col-span-1')).toBeInTheDocument();
    expect(container.querySelector('.md\\:col-span-2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument();
  });

  it('lays the body out on the configured column count', () => {
    const { container } = renderLayout([
      Section.make('Profile')
        .columns(2)
        .schema([TextInput.make('name')]),
    ]);

    expect(container.querySelector('.sm\\:grid-cols-2')).toBeInTheDocument();
  });
});

describe('GridComponent', () => {
  it('renders its children inside a grid', () => {
    const { container } = renderLayout([
      Grid.make(2).schema([TextInput.make('first'), TextInput.make('last')]),
    ]);

    expect(container.querySelector('.sm\\:grid-cols-2')).toBeInTheDocument();
    expect(screen.getByLabelText('First')).toBeInTheDocument();
    expect(screen.getByLabelText('Last')).toBeInTheDocument();
  });
});

describe('tabs primitives', () => {
  it('merges custom class names onto every part', () => {
    render(
      <TabsRoot defaultValue="one">
        <TabsList className="custom-list">
          <TabsTrigger className="custom-trigger" value="one">
            One
          </TabsTrigger>
        </TabsList>
        <TabsContent className="custom-content" value="one">
          Panel
        </TabsContent>
      </TabsRoot>,
    );

    expect(screen.getByRole('tablist')).toHaveClass('custom-list', 'inline-flex');
    expect(screen.getByRole('tab')).toHaveClass('custom-trigger');
    expect(within(screen.getByRole('tabpanel')).getByText('Panel')).toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveClass('custom-content', 'mt-4');
  });

  it('forwards refs to the underlying elements', () => {
    const list = React.createRef<HTMLDivElement>();
    const trigger = React.createRef<HTMLButtonElement>();
    const content = React.createRef<HTMLDivElement>();

    render(
      <TabsRoot defaultValue="one">
        <TabsList ref={list}>
          <TabsTrigger ref={trigger} value="one">
            One
          </TabsTrigger>
        </TabsList>
        <TabsContent ref={content} value="one">
          Panel
        </TabsContent>
      </TabsRoot>,
    );

    expect(list.current).toBeInstanceOf(HTMLElement);
    expect(trigger.current).toBeInstanceOf(HTMLElement);
    expect(content.current).toBeInstanceOf(HTMLElement);
  });
});
