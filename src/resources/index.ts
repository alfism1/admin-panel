import { registerResources } from '@/core/resources/registry';
import { ProductResource } from './ProductResource';
import { PostResource } from './PostResource';
import { RoleResource } from './RoleResource';
import { UserResource } from './UserResource';

/** The single place a new resource has to be mentioned. */
export const resources = registerResources([
  UserResource,
  RoleResource,
  PostResource,
  ProductResource,
]);
