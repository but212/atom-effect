import $ from 'jquery';
import { describe, expect, it } from 'vitest';
import type { WritableAtom } from '@/types';
import '@/index';

describe('Integration & Core API', () => {
  it('should handle Todo List with Search (synergy between atomList, atomVal, and computed)', async () => {
    interface Todo {
      id: number;
      text: string;
      done: boolean;
    }

    const todos = $.atom<Todo[]>([
      { id: 1, text: 'Buy milk', done: false },
      { id: 2, text: 'Clean room', done: true },
      { id: 3, text: 'Write tests', done: false },
    ]);
    const search = $.atom('');

    const filteredTodos = $.computed(() => {
      const query = search.value.toLowerCase();
      return todos.value.filter((todo: Todo) => todo.text.toLowerCase().includes(query));
    });

    const $app = $('<div id="todo-app">').appendTo(document.body);
    $app.append('<input type="text" id="search" placeholder="Search...">');
    $app.append('<ul id="todo-list"></ul>');

    const $search = $app.find('#search');
    const $list = $app.find('#todo-list');

    $search.atomVal(search);
    $list.atomList(filteredTodos, {
      key: 'id',
      render: (todo: Todo) =>
        `<li id="todo-${todo.id}" class="${todo.done ? 'done' : ''}">${todo.text}</li>`,
      update: ($el, todo: Todo) => {
        $el.toggleClass('done', todo.done);
        $el.text(todo.text);
      },
    });

    await $.nextTick();
    expect($list.children().length).toBe(3);

    // Filter "milk"
    $search.val('milk').trigger('input');
    await $.nextTick();
    expect($list.children().length).toBe(1);
    expect($list.find('#todo-1').length).toBe(1);

    // Clear filter
    $search.val('').trigger('input');
    await $.nextTick();
    expect($list.children().length).toBe(3);

    // Toggle done
    todos.value = todos.value.map((t: Todo) => (t.id === 1 ? { ...t, done: true } : t));
    await $.nextTick();
    expect($list.find('#todo-1').hasClass('done')).toBe(true);

    $app.remove();
  });

  it('should maintain reactivity after DOM reparenting', async () => {
    const count = $.atom(0);
    const $parent1 = $('<div id="parent1">').appendTo(document.body);
    const $parent2 = $('<div id="parent2">').appendTo(document.body);
    const $el = $('<div id="reactive-el">').appendTo($parent1);

    $el.atomText(count);

    await $.nextTick();
    expect($el.text()).toBe('0');
    expect($parent1.find('#reactive-el').length).toBe(1);

    // Reparent to parent2
    $el.appendTo($parent2);
    await $.nextTick();
    expect($parent1.find('#reactive-el').length).toBe(0);
    expect($parent2.find('#reactive-el').length).toBe(1);

    // Update atom
    count.value = 1;
    await $.nextTick();
    expect($el.text()).toBe('1');

    // Reparent back to parent1 using prependTo
    $el.prependTo($parent1);
    count.value = 2;
    await $.nextTick();
    expect($el.text()).toBe('2');
    expect($parent1.find('#reactive-el').length).toBe(1);

    $parent1.remove();
    $parent2.remove();
  });

  it('should handle Complex Form Validation (atomBind with parse/format and computed state)', async () => {
    const age = $.atom<number | null>(null);

    // Derived validity
    const isValid = $.computed(() => {
      const v = age.value;
      return v !== null && v >= 18 && v <= 100;
    });

    const $form = $('<div id="form">').appendTo(document.body);
    $form.append('<input type="text" id="age-input" placeholder="Enter age (18-100)">');
    $form.append('<span id="age-display"></span>');
    $form.append('<button id="submit">Submit</button>');

    const $input = $form.find('#age-input');
    const $display = $form.find('#age-display');
    const $submit = $form.find('#submit');

    $input.atomBind({
      val: [
        age,
        {
          parse: (v: string) => {
            const parsed = parseInt(v, 10);
            return Number.isNaN(parsed) ? null : parsed;
          },
          format: (v: unknown) => (v === null ? '' : String(v)),
        },
      ],
      css: {
        borderColor: $.computed(() => {
          if (age.value === null) return 'gray';
          return isValid.value ? 'green' : 'red';
        }),
      },
    });

    $display.atomText($.computed(() => (isValid.value ? 'Valid' : 'Invalid age')));
    $submit.atomBind({
      prop: { disabled: $.computed(() => !isValid.value) },
    });

    await $.nextTick();
    expect($display.text()).toBe('Invalid age');
    expect($submit.prop('disabled')).toBe(true);

    // Enter valid age
    $input.val('25').trigger('input');
    await $.nextTick();
    expect(age.value).toBe(25);
    expect(isValid.value).toBe(true);
    expect($display.text()).toBe('Valid');
    expect($submit.prop('disabled')).toBe(false);
    // Use toMatch to handle both 'green' and 'rgb(0, 128, 0)'
    expect($input.css('border-top-color')).toMatch(/green|rgb\(0, 128, 0\)/);

    // Enter invalid age
    $input.val('15').trigger('input');
    await $.nextTick();
    expect(age.value).toBe(15);
    expect(isValid.value).toBe(false);
    expect($display.text()).toBe('Invalid age');
    expect($submit.prop('disabled')).toBe(true);
    expect($input.css('border-top-color')).toMatch(/red|rgb\(255, 0, 0\)/);

    $form.remove();
  });

  it('should handle Nested Lists (atomList within atomList)', async () => {
    interface Item {
      id: number;
      name: string;
    }
    interface Category {
      id: number;
      title: string;
      items: WritableAtom<Item[]>;
    }

    const categories = $.atom<Category[]>([
      {
        id: 1,
        title: 'Fruits',
        items: $.atom([
          { id: 101, name: 'Apple' },
          { id: 102, name: 'Banana' },
        ]),
      },
      {
        id: 2,
        title: 'Vegetables',
        items: $.atom([{ id: 201, name: 'Carrot' }]),
      },
    ]);

    const $app = $('<div id="nested-app">').appendTo(document.body);

    $app.atomList(categories, {
      key: 'id',
      render: (cat: Category) => `
        <div id="cat-${cat.id}" class="category">
          <h3>${cat.title}</h3>
          <ul class="item-list"></ul>
        </div>
      `,
      bind: ($el, cat: Category) => {
        $el.find('.item-list').atomList<Item>(cat.items, {
          key: 'id',
          render: (item) => `<li id="item-${item.id}">${item.name}</li>`,
        });
      },
    });

    await $.nextTick();
    expect($app.find('.category').length).toBe(2);
    expect($app.find('#cat-1 .item-list li').length).toBe(2);
    expect($app.find('#cat-2 .item-list li').length).toBe(1);

    // Add item to Fruit
    categories.value[0]!.items.value = [
      ...categories.value[0]!.items.value,
      { id: 103, name: 'Cherry' },
    ];
    await $.nextTick();
    expect($app.find('#cat-1 .item-list li').length).toBe(3);
    expect($app.find('#item-103').text()).toBe('Cherry');

    // Add new category
    categories.value = [
      ...categories.value,
      {
        id: 3,
        title: 'Dairy',
        items: $.atom([{ id: 301, name: 'Milk' }]),
      },
    ];
    await $.nextTick();
    expect($app.find('.category').length).toBe(3);
    expect($app.find('#cat-3 h3').text()).toBe('Dairy');
    expect($app.find('#item-301').text()).toBe('Milk');

    $app.remove();
  });
});
