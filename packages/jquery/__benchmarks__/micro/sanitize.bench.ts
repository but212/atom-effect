/**
 * @fileoverview sanitizeHtml micro-benchmarks
 * @description Measures sanitization throughput across HTML profiles of varying
 * complexity.
 *
 * NOTE: Examples run in jsdom.
 */

import { bench, describe } from 'vitest';
import { sanitizeHtml } from '../../src/utils';
import { microBenchOptions } from '../utils/setup';

// ============================================================================
// Fixture HTML strings
// ============================================================================

/** Minimal safe fragment — zero dangerous content, few attributes. */
const HTML_CLEAN_SMALL = '<p class="intro">Hello <strong>world</strong></p>';

/** Realistic article fragment — safe, many nested elements and attributes. */
const HTML_CLEAN_LARGE = `
<article id="post-1" class="post featured" data-author="alice">
  <header>
    <h1 class="title">Article Title</h1>
    <time datetime="2024-01-01" class="date">Jan 1</time>
  </header>
  <section class="body">
    <p>First paragraph with <a href="/page" class="link" title="Go">a link</a> and
       <em>emphasis</em> and <strong>bold</strong> text.</p>
    <ul>
      ${Array.from({ length: 20 }, (_, i) => `<li class="item item-${i}" data-index="${i}">List item ${i}</li>`).join('\n      ')}
    </ul>
    <blockquote cite="/source">
      <p>A quoted paragraph with <code>inline code</code>.</p>
    </blockquote>
  </section>
  <footer class="meta">
    <span class="tag">tag1</span><span class="tag">tag2</span>
  </footer>
</article>
`.trim();

/** Contains a single dangerous tag to be removed. */
const HTML_WITH_SCRIPT =
  '<div><p>Safe content</p><script>alert(1)</script><p>More content</p></div>';

/** Multiple dangerous tags scattered through the tree. */
const HTML_MULTI_DANGEROUS = `
<div>
  <p>Paragraph</p>
  <script>evil1()</script>
  <span>Text</span>
  <iframe src="//evil.com"></iframe>
  <p>More text</p>
  <object data="//evil.com"></object>
  <em>Emphasis</em>
  <form action="//evil.com"><input type="text"></form>
</div>
`.trim();

/** Many event-handler attributes to exercise sanitizeAttributes. */
const HTML_EVENT_ATTRS = `
<div onclick="evil()" onmouseover="evil()" onfocus="evil()">
  <a href="javascript:evil()" onclick="evil()" onmousedown="evil()">Link</a>
  <img src="x" onerror="evil()" onload="evil()" alt="img">
  <button type="button" onclick="evil()" onkeyup="evil()">Click</button>
  <input type="text" onfocus="evil()" onblur="evil()" oninput="evil()">
</div>
`.trim();

/** Mix of safe attributes, event handlers, and dangerous protocol values. */
const HTML_MIXED_ATTRS = `
<div id="root" class="container" data-value="safe">
  <a href="javascript:evil()" class="link" title="bad" rel="noopener">XSS</a>
  <a href="/safe" class="link" onclick="evil()">Safe link</a>
  <img src="data:text/html;base64,PHNjcmlwdD4=" alt="bad">
  <img src="data:image/png;base64,iVBOR" class="icon" alt="ok">
  <p style="expression(evil())" class="text">CSS injection</p>
  <p style="color:red" class="text">Safe style</p>
</div>
`.trim();

// ============================================================================
// 1. End-to-end throughput by HTML profile
// ============================================================================

describe('sanitizeHtml — throughput by HTML profile', () => {
  bench(
    'clean small  (<10 nodes, no attributes to strip)',
    () => {
      sanitizeHtml(HTML_CLEAN_SMALL);
    },
    microBenchOptions
  );

  bench(
    'clean large  (50+ nodes, safe attributes only)',
    () => {
      sanitizeHtml(HTML_CLEAN_LARGE);
    },
    microBenchOptions
  );

  bench(
    'single dangerous tag  (script removal)',
    () => {
      sanitizeHtml(HTML_WITH_SCRIPT);
    },
    microBenchOptions
  );

  bench(
    'multiple dangerous tags  (script + iframe + object + form)',
    () => {
      sanitizeHtml(HTML_MULTI_DANGEROUS);
    },
    microBenchOptions
  );

  bench(
    'event-handler attrs  (10+ on* attributes to remove)',
    () => {
      sanitizeHtml(HTML_EVENT_ATTRS);
    },
    microBenchOptions
  );

  bench(
    'mixed attr profile  (protocols + data URIs + CSS injection)',
    () => {
      sanitizeHtml(HTML_MIXED_ATTRS);
    },
    microBenchOptions
  );
});

// ============================================================================
// 2. Batch throughput — simulates high-frequency sanitization calls
// ============================================================================

describe('sanitizeHtml — batch throughput', () => {
  bench(
    '100 × clean small',
    () => {
      for (let i = 0; i < 100; i++) sanitizeHtml(HTML_CLEAN_SMALL);
    },
    microBenchOptions
  );

  bench(
    '100 × mixed attr profile',
    () => {
      for (let i = 0; i < 100; i++) sanitizeHtml(HTML_MIXED_ATTRS);
    },
    microBenchOptions
  );

  bench(
    '100 × multi dangerous tags',
    () => {
      for (let i = 0; i < 100; i++) sanitizeHtml(HTML_MULTI_DANGEROUS);
    },
    microBenchOptions
  );
});
