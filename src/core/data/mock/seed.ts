import type { MockDatabase, MockPost, MockRole, MockUser } from './types';

export const PERMISSION_CATALOG = [
  'user.view',
  'user.create',
  'user.update',
  'user.delete',
  'user.activate',
  'role.view',
  'role.create',
  'role.update',
  'role.delete',
  'post.view',
  'post.create',
  'post.update',
  'post.delete',
  'post.publish',
];

const ROLES: MockRole[] = [
  {
    id: 1,
    name: 'Admin',
    slug: 'admin',
    description: 'Full access to every module.',
    permissions: ['*'],
    users_count: 0,
    created_at: '2024-01-04T08:00:00.000Z',
  },
  {
    id: 2,
    name: 'Editor',
    slug: 'editor',
    description: 'Manages content but not people.',
    permissions: ['post.*', 'user.view', 'role.view'],
    users_count: 0,
    created_at: '2024-02-11T08:00:00.000Z',
  },
  {
    id: 3,
    name: 'Viewer',
    slug: 'viewer',
    description: 'Read-only access.',
    permissions: ['user.view', 'post.view', 'role.view'],
    users_count: 0,
    created_at: '2024-03-19T08:00:00.000Z',
  },
];

const FIRST = [
  'Alya',
  'Bagus',
  'Citra',
  'Dimas',
  'Eka',
  'Fajar',
  'Gita',
  'Hendra',
  'Indah',
  'Joko',
  'Kirana',
  'Lukman',
  'Maya',
  'Naufal',
  'Oki',
  'Putri',
  'Rangga',
  'Sari',
  'Tio',
  'Ulfa',
];
const LAST = [
  'Pratama',
  'Wijaya',
  'Santoso',
  'Halim',
  'Nugroho',
  'Kusuma',
  'Saputra',
  'Anggraini',
  'Setiawan',
  'Maharani',
];

const BIOS = [
  'Building internal tools and keeping the data tidy.',
  'Coffee-driven product person. Ships on Fridays anyway.',
  'Writes documentation nobody asked for but everyone reads.',
  '',
];

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function buildUsers(): MockUser[] {
  const users: MockUser[] = [
    {
      id: 1,
      name: 'Alfi Alfarisi',
      email: 'admin@example.com',
      password: 'password',
      role_id: 1,
      is_active: true,
      avatar: null,
      bio: 'Owner of this panel.',
      joined_at: isoDaysAgo(420),
      orders_count: 128,
      created_at: isoDaysAgo(420),
      updated_at: isoDaysAgo(2),
    },
    {
      id: 2,
      name: 'Rina Editor',
      email: 'editor@example.com',
      password: 'password',
      role_id: 2,
      is_active: true,
      avatar: null,
      bio: 'Content lead.',
      joined_at: isoDaysAgo(300),
      orders_count: 41,
      created_at: isoDaysAgo(300),
      updated_at: isoDaysAgo(5),
    },
    {
      id: 3,
      name: 'Bima Viewer',
      email: 'viewer@example.com',
      password: 'password',
      role_id: 3,
      is_active: false,
      avatar: null,
      bio: '',
      joined_at: isoDaysAgo(120),
      orders_count: 3,
      created_at: isoDaysAgo(120),
      updated_at: isoDaysAgo(12),
    },
  ];

  for (let index = 0; index < 45; index += 1) {
    const first = FIRST[index % FIRST.length];
    const last = LAST[(index * 3) % LAST.length];
    const id = index + 4;
    users.push({
      id,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${id}@example.com`,
      password: 'password',
      role_id: (index % 3) + 1,
      is_active: index % 4 !== 0,
      avatar: null,
      bio: BIOS[index % BIOS.length],
      joined_at: isoDaysAgo(index * 7 + 3),
      orders_count: (index * 13) % 97,
      created_at: isoDaysAgo(index * 7 + 3),
      updated_at: isoDaysAgo(index % 30),
    });
  }

  return users;
}

const TITLES = [
  'Designing a resource-first admin panel',
  'Why declarative schemas beat hand-written forms',
  'Ten table patterns worth stealing',
  'A pragmatic guide to RBAC in the browser',
  'Shipping dark mode without regrets',
  'Keeping bundle size honest',
  'The case for URL-driven table state',
  'Server errors that land on the right field',
];

function buildPosts(users: MockUser[]): MockPost[] {
  return Array.from({ length: 32 }, (_, index) => {
    const status = (['draft', 'scheduled', 'published', 'archived'] as const)[index % 4];
    return {
      id: index + 1,
      title: `${TITLES[index % TITLES.length]}${index >= TITLES.length ? ` (part ${Math.floor(index / TITLES.length) + 1})` : ''}`,
      slug: `post-${index + 1}`,
      excerpt: 'A short summary that shows up in the table description slot.',
      content: 'Long form body content lives here.',
      status,
      is_featured: index % 5 === 0,
      author_id: users[index % 12].id,
      category: (['engineering', 'product', 'design'] as const)[index % 3],
      cover: null,
      published_at: status === 'published' ? isoDaysAgo(index * 3) : null,
      views: (index * 371) % 5000,
      created_at: isoDaysAgo(index * 3 + 1),
      updated_at: isoDaysAgo(index),
    };
  });
}

export function buildSeed(): MockDatabase {
  const users = buildUsers();
  const roles = ROLES.map((role) => ({
    ...role,
    users_count: users.filter((user) => user.role_id === role.id).length,
  }));
  return { users, roles, posts: buildPosts(users) };
}
