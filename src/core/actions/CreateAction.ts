import { Action } from './Action';

/** Header action on list pages; resolves to `{resource.route}/create`. */
export class CreateAction extends Action {
  static make(): CreateAction {
    return new CreateAction({ name: 'create', builtin: 'create', icon: 'plus', color: 'primary' });
  }
}
