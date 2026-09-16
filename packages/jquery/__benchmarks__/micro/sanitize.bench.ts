import { describe, test } from 'vitest';
import { isDangerousCssValue, isDangerousUrl, sanitizeHtml } from '../../src/utils/sanitize';
import { microBenchOptions } from '../utils/setup';

describe('Sanitize: Safe Content & Vulnerability checks', () => {
  const safeCases = [
    { name: 'sanitize small safe HTML', html: '<p>Hello, World!</p>' },
    {
      name: 'sanitize medium safe HTML',
      html: '<div class="card"><h3>Card Title</h3><p>This is a paragraph with <strong>bold</strong> and <em>italic</em> text.</p><span>Some item list:</span><ul><li>Item A</li><li>Item B</li></ul></div>',
    },
  ];

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

  test('sanitize safe and vulnerable HTML comparison', async ({ bench }) => {
    await bench.compare(
      ...safeCases.map(({ name, html }) =>
        bench(name, () => {
          sanitizeHtml(html);
        })
      ),
      ...vulnerabilityCases.map(({ name, payload }) =>
        bench(name, () => {
          sanitizeHtml(payload);
        })
      ),
      bench('mitigate complex DOM Clobbering payload', () => {
        sanitizeHtml('<form id="attributes"><input name="id"><input id="parentNode"></form>');
      }),
      bench('check safe vs unsafe URLs (100 runs)', () => {
        for (let i = 0; i < 50; i++) {
          isDangerousUrl('href', 'https://example.com/path');
          isDangerousUrl('src', 'javascript:alert(1)');
        }
      }),
      bench('check safe vs unsafe CSS values (100 runs)', () => {
        for (let i = 0; i < 50; i++) {
          isDangerousCssValue('color: red');
          isDangerousCssValue('width: expression(alert(1))');
        }
      }),
      microBenchOptions
    );
  });
});
