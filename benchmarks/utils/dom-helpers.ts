import { JSDOM } from 'jsdom';

export function setupDOM() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window as any;
  global.document = dom.window.document;
  global.Node = dom.window.Node;
  global.HTMLElement = dom.window.HTMLElement;
  return dom;
}

export function teardownDOM() {
  (global as any).window = undefined;
  (global as any).document = undefined;
  (global as any).Node = undefined;
  (global as any).HTMLElement = undefined;
}
