import type { ComputedAtom, ReactiveValue, ReadonlyAtom } from './types';

/**
 * Checks if a given value is a reactive object (Atom or Computed).
 * Robust check for correctness: must have both 'value' property and 'subscribe' method.
 */
export function isReactive(value: unknown): value is ReadonlyAtom<unknown> | ComputedAtom<unknown> {
  return value !== null && typeof value === 'object' && 'value' in value && 'subscribe' in value;
}

/**
 * Extracts the underlying raw value from a ReactiveValue.
 * Optimized for hot path by inlining the reactive check with high correctness.
 */
export function getValue<T>(source: ReactiveValue<T>): T {
  if (source !== null && typeof source === 'object' && 'value' in source && 'subscribe' in source) {
    return (source as ReadonlyAtom<T>).value;
  }
  return source as T;
}

/**
 * Generates a CSS selector string for a DOM element.
 * Optimized for zero-allocation parsing using native classList.
 */
export function getSelector(el: Element | JQuery): string {
  if (!el) return 'unknown';
  const dom = 'jquery' in el ? (el as JQuery)[0] : (el as Element);
  if (!dom) return 'unknown';

  const id = dom.id;
  if (id && typeof id === 'string') return `#${id}`;

  const tagName = dom.tagName.toLowerCase();
  const classes = dom.classList;

  if (classes && classes.length > 0) {
    let res = tagName;
    for (let i = 0, len = classes.length; i < len; i++) {
      const cls = classes[i];
      if (cls) res += `.${cls}`;
    }
    return res;
  }
  return tagName;
}

/**
 * Basic HTML sanitization for XSS mitigation.
 * Note: This is NOT a replacement for a full-featured sanitizer like DOMPurify.
 * It prevents common attacks like <script> tags and javascript: protocols.
 */
export function sanitizeHtml(html: string): string {
  let safe = String(html ?? '');

  // 0. Pre-process: Remove null bytes and control characters (bypass vectors)
  // These are often used to bypass regex filters while browsers ignore them
  safe = safe.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');

  // 1. Remove dangerous tags entirely (content included or tag stripped)
  // Dangerous tags: script, iframe, object, embed, base, meta, form, applet, link, style, template, noscript, title
  // Also remove processing instructions <? ... ?> which can be abused in some contexts
  safe = safe.replace(/<\?[\s\S]*?\?>/g, "")
             .replace(/<(script|iframe|object|embed|base|meta|form|applet|link|style|template|noscript|title)\b[^>]*>([\s\S]*?)<\/\1>/gim, "")
             .replace(/<(script|iframe|object|embed|base|meta|form|applet|link|style|template|noscript|title)\b[^>]*\/?>/gim, "");
  
  // 2. Neutralize dangerous protocols (javascript:, vbscript:, data:)
  
  // Helper to decode HTML entities for inspection (simple implementation)
  // This allows us to detect obfuscated protocols like "&#106;avascript:" -> "javascript:"
  const decodeEntities = (str: string) => {
    return str.replace(/&#x([0-9a-f]+);?/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
              .replace(/&#([0-9]+);?/gi, (_, code) => String.fromCharCode(parseInt(code, 10)));
  };

  const decoded = decodeEntities(safe);
  // Check against decoded version for protocols
  // We use a simple regex on the decoded string to find protocols
  if (decoded.match(/(?:java|vb)script:|data:/i)) {
    // If decoded string contains dangerous protocol, we must sanitize the ORIGINAL string
    // Since we can't easily map back, we aggressively replace potential protocol patterns in the original
    // A robust way: fail safe by removing the protocol from the original if detected in decoded
    
    // Aggressive pattern for the original string dealing with entities
    // Matches "j" or "&#106;" followed by "a" or "&#97;" etc...
    // This is too complex. 
    // Easier: Just replace the specific dangerous strings in the original using a broad regex 
    // that matches the protocol chars OR their entity equivalents.

    // Let's use a regex that matches "javascript:" where each char can be an entity
    const buildProtocolRegex = (protocol: string) => {
      return new RegExp(
        protocol.split('').map(c => {
          const code = c.charCodeAt(0);
          // Match the char, or decimal entity, or hex entity (case insensitive)
          return `(?:${c}|&#0*${code};?|&#x0*${code.toString(16)};?)`;
        }).join('\\s*') + '\\s*(?::|&colon;|&#x?0*((58)|(3a));?|%3a)',
        'gi'
      );
    };

    safe = safe.replace(buildProtocolRegex('javascript'), 'data-unsafe-protocol:')
               .replace(buildProtocolRegex('vbscript'), 'data-unsafe-protocol:')
               .replace(buildProtocolRegex('data'), 'data-unsafe-protocol:');
  } else {
      // Fast path for non-obfuscated protocols
      const protocolRegex = /((?:j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t|v\s*b\s*s\s*c\s*r\s*i\s*p\s*t|d\s*a\s*t\s*a)\s*(?::|&colon;|&#x?0*((58)|(3a));?|%3a))/gim;
      safe = safe.replace(protocolRegex, 'data-unsafe-protocol:');
  }
  
  // 3. Neutralize event handlers (on* attributes)
  // Replaces "onclick=" with "data-unsafe-attr="
  safe = safe.replace(/\bon\w+\s*=/gim, 'data-unsafe-attr=');

  // 4. Neutralize CSS expressions (IE legacy but dangerous) and behavior
  // expression(...), behavior:url(...)
  safe = safe.replace(/expression\s*\(/gim, 'data-unsafe-css(')
             .replace(/behavior\s*:/gim, 'data-unsafe-css:');

  return safe;
}

/**
 * Longest Increasing Subsequence (LIS)
 * Optimized for hardware and TypeScript strict null checks.
 * Time Complexity: O(N log N), Space Complexity: $O(N)$.
 */
export function getLIS(arr: Int32Array | number[]): Int32Array {
  const len = arr.length;
  if (len === 0) return new Int32Array(0);

  const predecessors = new Int32Array(len);
  const result = new Int32Array(len);
  let resultLen = 0;

  for (let i = 0; i < len; i++) {
    const val = arr[i];
    if (val === undefined || val === -1) continue;

    const lastIdx = resultLen > 0 ? result[resultLen - 1] : undefined;
    if (resultLen === 0 || (lastIdx !== undefined && (arr[lastIdx] ?? -1) < val)) {
      predecessors[i] = lastIdx ?? -1;
      result[resultLen++] = i;
      continue;
    }

    // Binary search for insertion point
    let left = 0;
    let right = resultLen - 1;
    while (left < right) {
      const mid = (left + right) >>> 1;
      const midIdx = result[mid];
      if (midIdx !== undefined && (arr[midIdx] ?? -1) < val) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    const leftIdx = result[left];
    if (leftIdx !== undefined && val < (arr[leftIdx] ?? Number.MAX_SAFE_INTEGER)) {
      if (left > 0) {
        predecessors[i] = result[left - 1] ?? -1;
      }
      result[left] = i;
    }
  }

  const lis = new Int32Array(resultLen);
  if (resultLen > 0) {
    let curr: number | undefined = result[resultLen - 1];
    for (let i = resultLen - 1; i >= 0 && curr !== undefined && curr !== -1; i--) {
      lis[i] = curr;
      curr = predecessors[curr];
    }
  }

  return lis;
}
