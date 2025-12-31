
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
  delete (global as any).window;
  delete (global as any).document;
  delete (global as any).Node;
  delete (global as any).HTMLElement;
}
