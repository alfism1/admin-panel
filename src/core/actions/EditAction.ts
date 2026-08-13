import { Action } from './Action';

export class EditAction extends Action {
  static make(): EditAction {
    return new EditAction({
      name: 'edit',
      builtin: 'edit',
      icon: 'pencil',
      color: 'gray',
      iconOnly: true,
      tooltip: 'Edit',
    });
  }
}
