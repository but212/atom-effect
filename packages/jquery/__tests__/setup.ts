// setup.ts
import $ from 'jquery';

const globalObject = globalThis as typeof globalThis & { $: JQueryStatic; jQuery: JQueryStatic };
globalObject.$ = $;
globalObject.jQuery = $;
