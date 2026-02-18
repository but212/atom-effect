/**
 * Constants for atom-effect-jquery
 */

export const LOG_PREFIXES = {
  ROUTE: '[$.route]',
  BIND: '[atomBind]',
  LIST: '[atomList]',
} as const;

export const ROUTE_DEFAULTS = {
  MODE: 'hash',
  ACTIVE_CLASS: 'active',
  BASE_PATH: '',
  AUTO_BIND_LINKS: false,
} as const;

export const INPUT_DEFAULTS = {
  EVENT: 'input',
  DEBOUNCE: 0,
} as const;

export const DANGEROUS_PROPS = ['innerHTML', 'outerHTML'] as const;

export const ERROR_MESSAGES = {
  ROUTE_NOT_FOUND: (name: string) => `Route "${name}" not found and no notFound route configured`,
  TEMPLATE_NOT_FOUND: (selector: string) => `Template "${selector}" not found`,
  TARGET_NOT_FOUND: (selector: string) => `Target element "${selector}" not found`,
  MALFORMED_URI: (raw: string) => `Malformed URI component: ${raw}`,
  UNSAFE_CONTENT: 'Unsafe content neutralized during sanitization.',
  BLOCKED_DANGEROUS_VALUE: (prop: string) => `Blocked dangerous value in "${prop}" property.`,
  BLOCKED_EVENT_HANDLER: (name: string) =>
    `Blocked setting dangerous event handler attribute "${name}".`,
  BLOCKED_PROTOCOL: (name: string) => `Blocked dangerous protocol in "${name}" attribute.`,
  BLOCKED_DANGEROUS_PROP: (name: string) =>
    `Blocked setting dangerous property "${name}". Use html binding for sanitized HTML.`,
  INVALID_INPUT_ELEMENT: (tagName: string) => `Val binding used on non-input element <${tagName}>.`,
  DUPLICATE_KEY: (key: string | number, index: number) =>
    `Duplicate key "${key}" at index ${index}.`,
} as const;
