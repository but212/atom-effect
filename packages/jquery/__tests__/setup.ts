// setup.ts
import $ from 'jquery';

const g = globalThis as typeof globalThis & { $: JQueryStatic; jQuery: JQueryStatic };
g.$ = $;
g.jQuery = $;
