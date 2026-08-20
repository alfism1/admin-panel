import type { RecordShape } from '@/core/data/types';
import type { FormComponent } from '@/core/forms/types';
import type { IconSpec } from '@/core/ui/icon';
import { labelize } from '@/lib/labelize';
import type {
  ActionColor,
  ActionContext,
  ActionSize,
  BuiltinAction,
  ConfirmationOptions,
  DialogWidth,
  ExportOptions,
  ReplicateOptions,
} from './types';

export type RecordPredicate = boolean | ((record: RecordShape | null) => boolean);

export interface ActionConfig {
  name: string;
  label?: string | ((record: RecordShape | null) => string);
  icon?: IconSpec;
  color?: ActionColor;
  size?: ActionSize;
  tooltip?: string;
  confirmation?: ConfirmationOptions | false;
  formSchema?: FormComponent[];
  modalWidth?: DialogWidth;
  handler?: (ctx: ActionContext) => void | Promise<void>;
  urlResolver?: (record: RecordShape | null) => string;
  openInNewTab?: boolean;
  visible?: RecordPredicate;
  authorization?: string | ((record: RecordShape | null) => boolean);
  disabled?: RecordPredicate;
  successNotification?: string | false;
  failureNotification?: string | false;
  /** Set by the built-in actions so the renderer can fill in resource defaults. */
  builtin?: BuiltinAction;
  /** Set by `ReplicateAction`; read by the runner when it builds the copy. */
  replicate?: ReplicateOptions;
  /** Set by `ExportBulkAction`; read by the runner when it writes the CSV. */
  export?: ExportOptions;
  /** Icon-only rendering, used for compact row action bars. */
  iconOnly?: boolean;
}

export class Action {
  protected config: ActionConfig;

  protected constructor(config: ActionConfig) {
    this.config = config;
  }

  static make(name: string): Action {
    return new Action({ name });
  }

  get definition(): Readonly<ActionConfig> {
    return this.config;
  }

  get name(): string {
    return this.config.name;
  }

  protected mutate(patch: Partial<ActionConfig>): this {
    const next: this = Object.create(Object.getPrototypeOf(this) as object);
    Object.assign(next, this);
    (next as unknown as { config: ActionConfig }).config = { ...this.config, ...patch };
    return next;
  }

  label(value: string | ((record: RecordShape | null) => string)): this {
    return this.mutate({ label: value });
  }

  icon(value: IconSpec): this {
    return this.mutate({ icon: value });
  }

  iconOnly(value = true): this {
    return this.mutate({ iconOnly: value });
  }

  color(value: ActionColor): this {
    return this.mutate({ color: value });
  }

  size(value: ActionSize): this {
    return this.mutate({ size: value });
  }

  tooltip(value: string): this {
    return this.mutate({ tooltip: value });
  }

  /** `false` opts a built-in action out of the confirmation it ships with. */
  requiresConfirmation(options: ConfirmationOptions | false = {}): this {
    return this.mutate({ confirmation: options });
  }

  /** Opens a modal built from a form schema before running the handler. */
  form(schema: FormComponent[]): this {
    return this.mutate({ formSchema: schema });
  }

  modalWidth(value: DialogWidth): this {
    return this.mutate({ modalWidth: value });
  }

  action(handler: (ctx: ActionContext) => void | Promise<void>): this {
    return this.mutate({ handler });
  }

  url(
    resolver: (record: RecordShape | null) => string,
    options?: { openInNewTab?: boolean },
  ): this {
    return this.mutate({ urlResolver: resolver, openInNewTab: options?.openInNewTab });
  }

  visible(value: RecordPredicate): this {
    return this.mutate({ visible: value });
  }

  authorize(value: string | ((record: RecordShape | null) => boolean)): this {
    return this.mutate({ authorization: value });
  }

  disabled(value: RecordPredicate): this {
    return this.mutate({ disabled: value });
  }

  successNotification(value: string | false): this {
    return this.mutate({ successNotification: value });
  }

  failureNotification(value: string | false): this {
    return this.mutate({ failureNotification: value });
  }

  resolveLabel(record: RecordShape | null): string {
    const { label, name } = this.config;
    if (typeof label === 'function') return label(record);
    return label ?? labelize(name);
  }

  isVisible(record: RecordShape | null): boolean {
    const { visible } = this.config;
    if (visible === undefined) return true;
    return typeof visible === 'function' ? visible(record) : visible;
  }

  isDisabled(record: RecordShape | null): boolean {
    const { disabled } = this.config;
    if (disabled === undefined) return false;
    return typeof disabled === 'function' ? disabled(record) : disabled;
  }
}
