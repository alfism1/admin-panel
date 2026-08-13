import { Action } from './Action';

/**
 * Route, label and permission come from the surrounding resource, so
 * `ViewAction.make()` needs no arguments.
 */
export class ViewAction extends Action {
  static make(): ViewAction {
    return new ViewAction({
      name: 'view',
      builtin: 'view',
      icon: 'eye',
      color: 'gray',
      iconOnly: true,
      tooltip: 'View',
    });
  }
}
