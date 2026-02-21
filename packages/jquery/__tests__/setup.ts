// setup.ts
import $ from 'jquery';

const g = globalThis as unknown as { $: JQueryStatic; jQuery: JQueryStatic };
g.$ = $;
g.jQuery = $;
