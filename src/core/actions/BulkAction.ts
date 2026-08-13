import { Action } from './Action';

/** Receives every selected record through `ctx.records`. */
export class BulkAction extends Action {
  static make(name: string): BulkAction {
    return new BulkAction({ name, size: 'sm', color: 'secondary' });
  }
}

export class DeleteBulkAction extends BulkAction {
  static make(): DeleteBulkAction {
    return new DeleteBulkAction({
      name: 'deleteSelected',
      builtin: 'deleteBulk',
      label: 'Delete selected',
      icon: 'trash',
      color: 'danger',
      size: 'sm',
      confirmation: {},
    });
  }
}
