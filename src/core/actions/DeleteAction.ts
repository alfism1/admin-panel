import { Action } from './Action';

export class DeleteAction extends Action {
  static make(): DeleteAction {
    return new DeleteAction({
      name: 'delete',
      builtin: 'delete',
      icon: 'trash',
      color: 'danger',
      iconOnly: true,
      tooltip: 'Delete',
      confirmation: {},
    });
  }
}
