import { DeleteBulkAction, BulkAction } from '@/core/actions/BulkAction';
import { DeleteAction } from '@/core/actions/DeleteAction';
import { EditAction } from '@/core/actions/EditAction';
import { ExportBulkAction } from '@/core/actions/ExportBulkAction';
import { ReplicateAction } from '@/core/actions/ReplicateAction';
import { ViewAction } from '@/core/actions/ViewAction';
import { apiClient } from '@/core/data/apiClient';
import { DatePicker } from '@/core/forms/fields/DatePicker';
import { FileUpload } from '@/core/forms/fields/FileUpload';
import { Select } from '@/core/forms/fields/Select';
import { Textarea } from '@/core/forms/fields/Textarea';
import { TextInput } from '@/core/forms/fields/TextInput';
import { Toggle } from '@/core/forms/fields/Toggle';
import { Section } from '@/core/forms/layouts/Section';
import { Tab, Tabs } from '@/core/forms/layouts/Tabs';
import { defineResource } from '@/core/resources/Resource';
import { BadgeColumn } from '@/core/tables/columns/BadgeColumn';
import { BooleanColumn } from '@/core/tables/columns/BooleanColumn';
import { DateColumn } from '@/core/tables/columns/DateColumn';
import { ImageColumn } from '@/core/tables/columns/ImageColumn';
import { TextColumn } from '@/core/tables/columns/TextColumn';
import { DateRangeFilter } from '@/core/tables/filters/DateRangeFilter';
import { SelectFilter } from '@/core/tables/filters/SelectFilter';
import { TernaryFilter } from '@/core/tables/filters/TernaryFilter';
import { Repeater } from '@/core/forms/fields/Repeater';
import { RepeaterAction } from '@/core/forms/fields/RepeaterAction';

const STATUSES = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  published: 'Published',
  archived: 'Archived',
};

const CATEGORIES = { engineering: 'Engineering', product: 'Product', design: 'Design' };

export const PostResource = defineResource({
  name: 'posts',
  model: 'Post',
  route: '/posts',

  navigation: { label: 'Posts', icon: 'file-text', group: 'Content', sort: 1 },
  labels: { singular: 'Post', plural: 'Posts' },
  recordTitleKey: 'title',

  permissions: {
    viewAny: 'post.view',
    view: 'post.view',
    create: 'post.create',
    update: 'post.update',
    delete: 'post.delete',
  },

  form: [
    Tabs.make('post-tabs').tabs([
      Tab.make('Content')
        .icon('file-text')
        .columns(2)
        .schema([
          TextInput.make('title')
            .required()
            .maxLength(180)
            .autofocus()
            .columnSpanFull()
            .live({ debounce: 250 })
            .afterStateUpdated(({ state, set, operation }) => {
              // Only auto-slug while drafting; an existing slug is a permalink.
              if (operation === 'create') {
                set(
                  'slug',
                  state
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, ''),
                );
              }
            }),

          TextInput.make('slug')
            .required()
            .prefix('/blog/')
            .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and dashes only.'),

          Select.make('category').options(CATEGORIES).native().required(),

          Textarea.make('excerpt').rows(2).maxLength(200).columnSpanFull(),
          Textarea.make('content').rows(10).autosize().required().columnSpanFull(),
        ]),

      Tab.make('Publishing')
        .icon('send')
        .columns(2)
        .schema([
          Select.make('status').options(STATUSES).native().default('draft').required(),

          DatePicker.make('published_at')
            .label('Publish at')
            .time()
            .required((ctx) => ctx.get('status') === 'scheduled')
            .visible((ctx) => ctx.get('status') !== 'draft')
            .helperText('Required for scheduled posts.'),

          Select.make('author_id')
            .label('Author')
            .relationship({ resource: 'users', titleKey: 'name' })
            .searchable()
            .required(),

          Toggle.make('is_featured')
            .label('Feature on the homepage')
            .onColor('success')
            .authorize('post.publish'),
        ]),

      // A repeater stored in a JSON column: the array *is* `posts.faqs`, so it
      // rides the ordinary create/update payload with no server code at all.
      Tab.make('FAQ')
        .icon('message-square')
        .schema([
          Repeater.make('faqs')
            .label('Questions')
            .hiddenLabel()
            .defaultItems(0)
            .maxItems(10)
            .collapsible()
            .cloneable()
            .distinct('question')
            .fixIndistinctState()
            .itemLabel((item) => String(item.question ?? ''))
            .addActionLabel('Add a question')
            .schema([
              TextInput.make('question').required().maxLength(160).columnSpanFull(),
              Textarea.make('answer').rows(2).required().columnSpanFull(),
            ]),
        ]),

      // A repeater backed by its own table. `withRepeaterRelationships` fills
      // and saves `post_blocks` through the data provider — see main.tsx.
      Tab.make('Blocks')
        .icon('list')
        .schema([
          Repeater.make('blocks')
            .label('Content blocks')
            .hiddenLabel()
            .relationship({ resource: 'post_blocks', foreignKey: 'post_id' })
            .orderColumn('position')
            .defaultItems(0)
            .grid(2)
            .collapsed()
            .cloneable()
            .itemLabel((item) => String(item.heading || item.kind || ''))
            .addActionLabel('Add a block')
            .deleteAction((action) =>
              action.requiresConfirmation({
                description: 'The block is removed from the post when you save.',
              }),
            )
            .extraItemActions([
              RepeaterAction.make('clear')
                .label('Clear body')
                .icon('x-circle')
                .visible((item) => Boolean(item.body))
                .action(({ item, set }) => set({ ...item, body: '' })),
            ])
            .schema([
              Select.make('kind')
                .options({ paragraph: 'Paragraph', quote: 'Quote', code: 'Code' })
                .native()
                .required(),
              TextInput.make('heading').maxLength(180),
              Textarea.make('body').rows(3).required().columnSpanFull(),
            ]),
        ]),

      Tab.make('Media')
        .icon('image')
        .schema([
          FileUpload.make('cover')
            .label('Cover image')
            .image()
            .maxSize(4096)
            .directory('covers')
            .helperText('Recommended 1600×900.'),
        ]),
    ]),

    Section.make('Internal notes')
      .aside()
      .description('Only visible to editors and above.')
      .visible((ctx) => ctx.can('post.publish'))
      .schema([Textarea.make('notes').rows(3).hiddenLabel()]),
  ],

  table: {
    columns: [
      ImageColumn.make('cover').square().size(40).label('').defaultImageUrl(''),

      TextColumn.make('title')
        .searchable()
        .sortable()
        .weight('semibold')
        .limit(60)
        .description((record) => String(record.excerpt ?? ''))
        .url((record) => `/posts/${String(record.id)}`),

      BadgeColumn.make('status')
        .colors({ draft: 'gray', scheduled: 'info', published: 'success', archived: 'warning' })
        .icons({ published: 'check-circle', archived: 'archive' }),

      TextColumn.make('author.name').label('Author').toggleable(),

      BooleanColumn.make('is_featured').label('Featured').trueIcon('star').trueColor('warning'),

      TextColumn.make('views').numeric().alignEnd().sortable().toggleable(),

      DateColumn.make('published_at')
        .label('Published')
        .since()
        .sortable()
        .default('Not published'),

      DateColumn.make('created_at')
        .label('Created')
        .dateFormat('dd MMM yyyy')
        .sortable()
        .toggleable({ hiddenByDefault: true }),
    ],

    filters: [
      SelectFilter.make('status').options(STATUSES).multiple(),
      SelectFilter.make('category').options(CATEGORIES).multiple(),
      SelectFilter.make('author_id')
        .label('Author')
        .relationship({ resource: 'users', titleKey: 'name' }),
      TernaryFilter.make('is_featured')
        .label('Featured')
        .trueLabel('Featured')
        .falseLabel('Regular'),
      DateRangeFilter.make('created_at').label('Created'),
    ],

    actions: [
      ViewAction.make(),
      EditAction.make(),
      // A copy starts as an unpublished draft with its own permalink, so it can
      // never collide with the post it came from.
      ReplicateAction.make()
        .exclude('views', 'author')
        .beforeReplicaSaved((replica) => ({
          ...replica,
          title: `${String(replica.title)} (copy)`,
          slug: `${String(replica.slug)}-copy`,
          status: 'draft',
          published_at: null,
          is_featured: false,
        }))
        .redirectTo('edit'),
      DeleteAction.make(),
    ],

    bulkActions: [
      BulkAction.make('publish')
        .label('Publish selected')
        .icon('send')
        .color('success')
        .authorize('post.publish')
        .requiresConfirmation({ heading: 'Publish the selected posts?' })
        .action(async ({ records }) => {
          await Promise.all(
            records.map((record) =>
              apiClient.patch(`/posts/${String(record.id)}`, {
                status: 'published',
                published_at: new Date().toISOString(),
              }),
            ),
          );
        })
        .successNotification('Selected posts are now published.'),
      ExportBulkAction.make(),
      DeleteBulkAction.make(),
    ],

    defaultSort: { column: 'created_at', direction: 'desc' },
    defaultPerPage: 10,
    striped: true,
    emptyState: {
      heading: 'No posts yet',
      description: 'Write your first post.',
      icon: 'file-text',
    },
  },
});
