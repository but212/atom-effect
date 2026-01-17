// setup.ts
import $ from 'jquery';
// Make jQuery available globally if needed by some plugins (though we import it)
const g = globalThis as unknown as { $: JQueryStatic; jQuery: JQueryStatic };
g.$ = $;
g.jQuery = $;
