export const LOG_PREFIXES = {
  ROUTE: '[atom-route]',
  BINDING: '[atom-binding]',
  LIST: '[atom-list]',
  MOUNT: '[atom-mount]',
} as const;

export const ROUTE_DEFAULTS = Object.freeze({
  mode: 'hash',
  basePath: '',
  autoBindLinks: false,
  activeClass: 'active',
} as const);

export const INPUT_DEFAULTS = Object.freeze({ EVENT: 'input', DEBOUNCE: 0 } as const);
export const DEBUG_DEFAULTS = Object.freeze({ HIGHLIGHT_DURATION_MS: 500 } as const);

export const VALID_INPUT_TAGS: ReadonlySet<string> = new Set(['input', 'select', 'textarea']);

export const URL_PROPS: ReadonlySet<string> = new Set([
  'src',
  'href',
  'action',
  'formaction',
  'data',
  'poster',
  'background',
  'cite',
  'longdesc',
  'profile',
  'usemap',
  'classid',
  'codebase',
  'xlink:href',
]);

export const DANGEROUS_PROPS: ReadonlySet<string> = new Set([
  'innerHTML',
  'outerHTML',
  'srcdoc',
  '__proto__',
  'constructor',
  'prototype',
]);

/** Regex-like pattern for dangerous protocols (javascript, vbscript) with optional whitespace. */
export const DANGEROUS_PROTOCOL_PATTERN =
  '(?:j\\s*a\\s*v\\s*a\\s*s\\s*c\\s*r\\s*i\\s*p\\s*t|v\\s*b\\s*s\\s*c\\s*r\\s*i\\s*p\\s*t)';

export const ERROR_MESSAGES = {
  ROUTE: {
    NOT_FOUND: (n: string) => `Route "${n}" not found`,
    TEMPLATE_NOT_FOUND: (s: string) => `Template "${s}" not found`,
    TARGET_NOT_FOUND: (s: string) => `Target "${s}" not found`,
    MALFORMED_URI: (r: string) => `Malformed URI: ${r}`,
  },
  SECURITY: {
    UNSAFE_CONTENT: () => 'Unsafe content neutralized.',
    BLOCKED_CSS_VALUE: (p: string) => `Blocked CSS: "${p}".`,
    BLOCKED_EVENT_HANDLER: (n: string) => `Blocked handler: "${n}".`,
    BLOCKED_PROTOCOL: (n: string) => `Blocked protocol: "${n}".`,
    BLOCKED_PROP: (n: string) => `Blocked prop: "${n}".`,
  },
  BINDING: {
    INVALID_INPUT_ELEMENT: (t: string) => `Invalid element <${t}> for val.`,
    MISSING_SOURCE: (m: string) => `[${m}] source required.`,
    MISSING_CONDITION: (m: string) => `[${m}] condition required.`,
    UPDATER_ERROR: (d: string, s?: boolean) => `Updater failed: "${d}"${s ? ' (static)' : ''}`,
    CLEANUP_ERROR: (i?: string) => `Binding cleanup error${i ? `: ${i}` : ''}`,
    PARSE_ERROR: (d?: string) => `Parse error${d ? `: ${d}` : ''}`,
  },
  LIST: {
    DUPLICATE_KEY: (k: string | number, i: number) => `Duplicate key "${k}" at index ${i}.`,
  },
  MOUNT: {
    ERROR: (n?: string) => `Mount error${n ? ` in <${n}>` : ''}`,
    CLEANUP_ERROR: (n?: string) => `Cleanup error${n ? ` in <${n}>` : ''}`,
  },
  CORE: {
    EFFECT_DISPOSE_ERROR: (i?: string) => `Dispose error${i ? `: ${i}` : ''}`,
  },
} as const;
