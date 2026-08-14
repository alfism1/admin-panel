export interface MockUser {
  id: number;
  name: string;
  email: string;
  password: string;
  role_id: number;
  is_active: boolean;
  avatar: string | null;
  bio: string;
  joined_at: string;
  orders_count: number;
  created_at: string;
  updated_at: string;
}

export interface MockRole {
  id: number;
  name: string;
  slug: string;
  description: string;
  permissions: string[];
  users_count: number;
  created_at: string;
}

export interface MockPost {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  status: 'draft' | 'scheduled' | 'published' | 'archived';
  is_featured: boolean;
  author_id: number;
  category: 'engineering' | 'product' | 'design';
  cover: string | null;
  published_at: string | null;
  views: number;
  created_at: string;
  updated_at: string;
}

export interface MockDatabase {
  users: MockUser[];
  roles: MockRole[];
  posts: MockPost[];
}

export type MockCollection = keyof MockDatabase;
