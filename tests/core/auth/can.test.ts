import { describe, expect, it } from 'vitest';
import { createPermissionChecker } from '@/core/auth/can';

describe('createPermissionChecker', () => {
  describe('exact grants', () => {
    const { can } = createPermissionChecker(['user.view', 'post.create']);

    it('grants a listed permission', () => {
      expect(can('user.view')).toBe(true);
      expect(can('post.create')).toBe(true);
    });

    it('denies anything not listed', () => {
      expect(can('user.delete')).toBe(false);
      expect(can('post.view')).toBe(false);
    });
  });

  describe('wildcards', () => {
    const { can } = createPermissionChecker(['user.*']);

    it('grants every action under the prefix', () => {
      expect(can('user.view')).toBe(true);
      expect(can('user.delete')).toBe(true);
    });

    it('grants nested actions under the prefix', () => {
      expect(can('user.roles.assign')).toBe(true);
    });

    it('does not leak to a sibling namespace', () => {
      expect(can('post.view')).toBe(false);
    });

    it('does not grant the bare prefix itself', () => {
      expect(can('user')).toBe(false);
    });
  });

  describe('super admin', () => {
    const { can, canAny, canAll } = createPermissionChecker(['*']);

    it('grants everything', () => {
      expect(can('anything.at.all')).toBe(true);
      expect(canAny(['a', 'b'])).toBe(true);
      expect(canAll(['a', 'b'])).toBe(true);
    });
  });

  describe('empty permission string', () => {
    it('is treated as unrestricted, so ungated resources stay reachable', () => {
      expect(createPermissionChecker([]).can('')).toBe(true);
    });
  });

  describe('canAny', () => {
    const { canAny } = createPermissionChecker(['user.view']);

    it('passes when one of the list is granted', () => {
      expect(canAny(['user.delete', 'user.view'])).toBe(true);
    });

    it('fails when none are granted', () => {
      expect(canAny(['user.delete', 'post.view'])).toBe(false);
    });

    it('passes on an empty list — nothing was required', () => {
      expect(canAny([])).toBe(true);
    });
  });

  describe('canAll', () => {
    const { canAll } = createPermissionChecker(['user.view', 'user.delete']);

    it('passes only when every entry is granted', () => {
      expect(canAll(['user.view', 'user.delete'])).toBe(true);
      expect(canAll(['user.view', 'post.view'])).toBe(false);
    });

    it('passes on an empty list', () => {
      expect(canAll([])).toBe(true);
    });
  });

  it('returns a stable answer when the same permission is asked twice', () => {
    const { can } = createPermissionChecker(['user.*']);
    expect(can('user.view')).toBe(true);
    expect(can('user.view')).toBe(true);
    expect(can('post.view')).toBe(false);
    expect(can('post.view')).toBe(false);
  });

  it('grants nothing when the user has no permissions', () => {
    const { can } = createPermissionChecker([]);
    expect(can('user.view')).toBe(false);
  });
});
