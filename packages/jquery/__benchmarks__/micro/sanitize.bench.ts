/**
 * @fileoverview Micro-benchmarks for the HTML Sanitization Engine (sanitizeHtml).
 */

import { bench, describe } from 'vitest';
import { isDangerousCssValue, isDangerousUrl, sanitizeHtml } from '../../src/utils/sanitize';
import { microBenchOptions } from '../utils/setup';

// ============================================================================
// 1. Basic HTML Sanitization
// ============================================================================

describe('Sanitize: Safe Content', () => {
  const smallHtml = '<p>Hello, World!</p>';
  const mediumHtml = `
    <div class="card">
      <h3>Card Title</h3>
      <p>This is a paragraph with <strong>bold</strong> and <em>italic</em> text.</p>
      <span>Some item list:</span>
      <ul>
        <li>Item A</li>
        <li>Item B</li>
      </ul>
    </div>
  `;

  bench(
    'sanitize small safe HTML',
    () => {
      sanitizeHtml(smallHtml);
    },
    microBenchOptions
  );

  bench(
    'sanitize medium safe HTML',
    () => {
      sanitizeHtml(mediumHtml);
    },
    microBenchOptions
  );
});

// ============================================================================
// 2. Vulnerability Scrubbing
// ============================================================================

describe('Sanitize: Vulnerability Neutralization', () => {
  const xssTagPayload =
    '<div><script>alert(1)</script><iframe src="javascript:alert(2)"></iframe></div>';
  const xssEventPayload = '<img src="x" onerror="alert(1)" onload="alert(2)" onclick="alert(3)">';
  const xssNestedPayload = '<iframe srcdoc="<script>alert(1)</script>"></iframe>';

  bench(
    'scrub blacklisted tags (script, iframe)',
    () => {
      sanitizeHtml(xssTagPayload);
    },
    microBenchOptions
  );

  bench(
    'scrub inline event attributes (onerror, onload, onclick)',
    () => {
      sanitizeHtml(xssEventPayload);
    },
    microBenchOptions
  );

  bench(
    'scrub recursively nested srcdoc payloads',
    () => {
      sanitizeHtml(xssNestedPayload);
    },
    microBenchOptions
  );
});

// ============================================================================
// 3. URI and CSS Validation
// ============================================================================

describe('Sanitize: URI and CSS Checks', () => {
  bench(
    'check safe vs unsafe URLs (100 runs)',
    () => {
      for (let i = 0; i < 50; i++) {
        isDangerousUrl('href', 'https://example.com/path');
        isDangerousUrl('src', 'javascript:alert(1)');
      }
    },
    microBenchOptions
  );

  bench(
    'check safe vs unsafe CSS values (100 runs)',
    () => {
      for (let i = 0; i < 50; i++) {
        isDangerousCssValue('color: red');
        isDangerousCssValue('width: expression(alert(1))');
      }
    },
    microBenchOptions
  );
});

// ============================================================================
// 4. DOM Clobbering Mitigation
// ============================================================================

describe('Sanitize: DOM Clobbering prevention', () => {
  // Payloads attempting to clobber attributes property or parent node reference
  const clobberPayload = '<form id="attributes"><input name="id"><input id="parentNode"></form>';

  bench(
    'mitigate complex DOM Clobbering payload',
    () => {
      sanitizeHtml(clobberPayload);
    },
    microBenchOptions
  );
});
