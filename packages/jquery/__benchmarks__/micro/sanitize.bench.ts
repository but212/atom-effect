/**
 * @fileoverview Micro-benchmarks for the HTML Sanitization Engine (sanitizeHtml).
 */

import { bench, describe } from 'vitest';
import { isDangerousCssValue, isDangerousUrl, sanitizeHtml } from '../../src/utils/sanitize';
import { microBenchOptions } from '../utils/setup';

describe('Sanitize: Safe Content & Vulnerability checks', () => {
  const run = (name: string, fn: () => void) => bench(name, fn, microBenchOptions);

  const safeCases = [
    { name: 'sanitize small safe HTML', html: '<p>Hello, World!</p>' },
    {
      name: 'sanitize medium safe HTML',
      html: '<div class="card"><h3>Card Title</h3><p>This is a paragraph with <strong>bold</strong> and <em>italic</em> text.</p><span>Some item list:</span><ul><li>Item A</li><li>Item B</li></ul></div>',
    },
  ];

  for (const { name, html } of safeCases) {
    run(name, () => {
      sanitizeHtml(html);
    });
  }

  const vulnerabilityCases = [
    {
      name: 'scrub blacklisted tags (script, iframe)',
      payload: '<div><script>alert(1)</script><iframe src="javascript:alert(2)"></iframe></div>',
    },
    {
      name: 'scrub inline event attributes (onerror, onload, onclick)',
      payload: '<img src="x" onerror="alert(1)" onload="alert(2)" onclick="alert(3)">',
    },
    {
      name: 'scrub recursively nested srcdoc payloads',
      payload: '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    },
  ];

  for (const { name, payload } of vulnerabilityCases) {
    run(name, () => {
      sanitizeHtml(payload);
    });
  }

  run('check safe vs unsafe URLs (100 runs)', () => {
    for (let i = 0; i < 50; i++) {
      isDangerousUrl('href', 'https://example.com/path');
      isDangerousUrl('src', 'javascript:alert(1)');
    }
  });

  run('check safe vs unsafe CSS values (100 runs)', () => {
    for (let i = 0; i < 50; i++) {
      isDangerousCssValue('color: red');
      isDangerousCssValue('width: expression(alert(1))');
    }
  });

  run('mitigate complex DOM Clobbering payload', () => {
    sanitizeHtml('<form id="attributes"><input name="id"><input id="parentNode"></form>');
  });
});
