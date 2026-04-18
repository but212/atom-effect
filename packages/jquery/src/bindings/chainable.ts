import $ from 'jquery';
import { bindForm } from '@/bindings/form';
import {
  bindAttr,
  bindChecked,
  bindClass,
  bindCss,
  bindEvents,
  bindHtml,
  bindOn,
  bindProp,
  bindText,
  bindVal,
  bindVisibility,
} from '@/bindings/unified';
import { ERROR_MESSAGES, LOG_PREFIXES } from '@/constants';
import { atomEachElement, unpack } from '@/core/dom';
import { registry } from '@/core/registry';
import type {
  AsyncReactiveValue,
  BindingOptions,
  CssBindings,
  FormOptions,
  PrimitiveValue,
  ReactiveValue,
  ValOptions,
  WritableAtom,
} from '@/types';

import { debug } from '@/utils/debug';

$.fn.atomText = function <T>(source: AsyncReactiveValue<T>, formatter?: (v: T) => string): JQuery {
  return atomEachElement(this, (el) => bindText(el, source, formatter));
};

$.fn.atomHtml = function (source: AsyncReactiveValue<string>): JQuery {
  return atomEachElement(this, (el) => bindHtml(el, source));
};

$.fn.atomClass = function (
  this: JQuery,
  classNameOrMap: string | Record<string, AsyncReactiveValue<boolean>>,
  condition?: AsyncReactiveValue<boolean>
): JQuery {
  const map =
    typeof classNameOrMap === 'string'
      ? condition === undefined
        ? null
        : { [classNameOrMap]: condition }
      : classNameOrMap;

  if (!map) {
    console.warn(
      `${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.BINDING.MISSING_CONDITION('atomClass')}`
    );
    return this;
  }

  return atomEachElement(this, (el) => bindClass(el, map));
};

$.fn.atomCss = function (
  this: JQuery,
  propOrMap: string | CssBindings,
  source?: AsyncReactiveValue<string | number>,
  unit?: string
): JQuery {
  const map =
    typeof propOrMap === 'string'
      ? source === undefined
        ? null
        : { [propOrMap]: unit ? [source as ReactiveValue<number>, unit] : source! }
      : propOrMap;

  if (!map) {
    console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.BINDING.MISSING_SOURCE('atomCss')}`);
    return this;
  }

  return atomEachElement(this, (el) => bindCss(el, map as CssBindings));
};

$.fn.atomAttr = function (
  this: JQuery,
  nameOrMap: string | Record<string, AsyncReactiveValue<PrimitiveValue>>,
  source?: AsyncReactiveValue<PrimitiveValue>
): JQuery {
  const map =
    typeof nameOrMap === 'string'
      ? source === undefined
        ? null
        : { [nameOrMap]: source }
      : nameOrMap;

  if (!map) {
    console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.BINDING.MISSING_SOURCE('atomAttr')}`);
    return this;
  }

  return atomEachElement(this, (el) => bindAttr(el, map));
};

$.fn.atomProp = function <T>(
  this: JQuery,
  nameOrMap: string | Record<string, AsyncReactiveValue<T>>,
  source?: AsyncReactiveValue<T>
): JQuery {
  const map =
    typeof nameOrMap === 'string'
      ? source === undefined
        ? null
        : ({ [nameOrMap]: source } as Record<string, AsyncReactiveValue<unknown>>)
      : (nameOrMap as Record<string, AsyncReactiveValue<unknown>>);

  if (!map) {
    console.warn(`${LOG_PREFIXES.BINDING} ${ERROR_MESSAGES.BINDING.MISSING_SOURCE('atomProp')}`);
    return this;
  }

  return atomEachElement(this, (el) => bindProp(el, map));
};

$.fn.atomShow = function (condition: AsyncReactiveValue<boolean>): JQuery {
  return atomEachElement(this, (el) => bindVisibility(el, condition, false));
};

$.fn.atomHide = function (condition: AsyncReactiveValue<boolean>): JQuery {
  return atomEachElement(this, (el) => bindVisibility(el, condition, true));
};

$.fn.atomVal = function <T>(atom: WritableAtom<T>, options: ValOptions<T> = {}): JQuery {
  return atomEachElement(this, (el) =>
    bindVal(el, atom as WritableAtom<unknown>, options as ValOptions<unknown>)
  );
};

$.fn.atomChecked = function (atom: WritableAtom<boolean>): JQuery {
  return atomEachElement(this, (el) => bindChecked(el, atom));
};

$.fn.atomForm = function <T extends object>(
  atom: WritableAtom<T>,
  options: FormOptions<T> = {}
): JQuery {
  return atomEachElement(this, (el) => {
    if (el instanceof HTMLFormElement) {
      bindForm(el, atom as WritableAtom<object>, options as unknown as FormOptions<unknown>);
    } else {
      debug.warn(LOG_PREFIXES.BINDING, 'Skipping non-Form element for atomForm');
    }
  });
};

$.fn.atomOn = function (event: string, handler: (e: JQuery.Event) => void): JQuery {
  return atomEachElement(this, (el) => bindOn(el, event, handler));
};

interface BindingTask {
  key: keyof BindingOptions<unknown>;
  run: (el: HTMLElement, val: unknown) => void;
}

const BINDING_TASKS: BindingTask[] = [
  {
    key: 'text',
    run: (el, v) =>
      bindText(el, ...(unpack(v) as [AsyncReactiveValue<unknown>, (v: unknown) => string])),
  },
  { key: 'html', run: (el, v) => bindHtml(el, v as AsyncReactiveValue<string>) },
  {
    key: 'class',
    run: (el, v) => bindClass(el, v as Record<string, AsyncReactiveValue<boolean>>),
  },
  { key: 'css', run: (el, v) => bindCss(el, v as CssBindings) },
  {
    key: 'attr',
    run: (el, v) => bindAttr(el, v as Record<string, AsyncReactiveValue<PrimitiveValue>>),
  },
  {
    key: 'prop',
    run: (el, v) => bindProp(el, v as Record<string, AsyncReactiveValue<unknown>>),
  },
  { key: 'show', run: (el, v) => bindVisibility(el, v as AsyncReactiveValue<boolean>, false) },
  { key: 'hide', run: (el, v) => bindVisibility(el, v as AsyncReactiveValue<boolean>, true) },
  {
    key: 'val',
    run: (el, v) => bindVal(el, ...(unpack(v) as [WritableAtom<unknown>, ValOptions<unknown>])),
  },
  { key: 'checked', run: (el, v) => bindChecked(el, v as WritableAtom<boolean>) },
  {
    key: 'form',
    run: (el, v) => {
      if (el instanceof HTMLFormElement) {
        bindForm(el, ...(unpack(v) as [WritableAtom<object>, FormOptions<unknown>]));
      }
    },
  },
  { key: 'on', run: (el, v) => bindEvents(el, v as Record<string, (e: JQuery.Event) => void>) },
];

$.fn.atomBind = function <T>(this: JQuery, options: BindingOptions<T>): JQuery {
  const activeTasks: BindingTask[] = [];
  const opt = options as Record<string, unknown>;

  for (let i = 0, len = BINDING_TASKS.length; i < len; i++) {
    const task = BINDING_TASKS[i]!;
    if (opt[task.key] !== undefined) {
      activeTasks.push(task);
    }
  }

  if (activeTasks.length === 0) return this;

  return atomEachElement(this, (el) => {
    for (let i = 0, len = activeTasks.length; i < len; i++) {
      const task = activeTasks[i]!;
      task.run(el, opt[task.key]);
    }
  });
};

$.fn.atomUnbind = function (this: JQuery): JQuery {
  return atomEachElement(this, (el) => registry.cleanupTree(el));
};
