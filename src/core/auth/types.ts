export interface AuthUser {
  id: string | number;
  name: string;
  email: string;
  avatar?: string | null;
  roles: string[];
  permissions: string[];
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken?: string;
  user: AuthUser;
}

export type AuthStatus = 'idle' | 'authenticating' | 'authenticated' | 'unauthenticated';

export type PermissionMode = 'any' | 'all';
