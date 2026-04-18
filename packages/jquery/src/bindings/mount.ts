import { batch, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { atomEachElement } from '@/core/dom';
import { registry } from '@/core/registry';
import type { ComponentFn } from '@/types';

const EMPTY_PROPS = Object.freeze({});

$.fn.atomMount = function <P>(this: JQuery, component: ComponentFn<P>, props?: P): JQuery {
  const p = (props ?? EMPTY_PROPS) as P;

  return atomEachElement(this, (el) => {
    registry.cleanupTree(el);

    const teardown = untracked(() => batch(() => component($(el), p)));

    if (typeof teardown === 'function') {
      registry.setComponentCleanup(el, teardown);
    }
  });
};

$.fn.atomUnmount = function (this: JQuery): JQuery {
  return atomEachElement(this, (el) => registry.cleanupTree(el));
};
