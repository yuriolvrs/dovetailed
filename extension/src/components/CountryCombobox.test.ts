// What this file is: behaviour tests for the country combobox (typing, keys, blur). It renders with react-dom in jsdom and needs no testing library.
// In plain terms: checks that the country box can be used with the keyboard and that it keeps or clears the country correctly.
import { createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CountryCombobox } from './CountryCombobox';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const countries = [
  { code: 'AU', name: 'Australia' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PL', name: 'Poland' },
  { code: 'US', name: 'United States' },
];

let host: HTMLDivElement;
let root: Root;
let current: string | undefined;

function Harness({ initial }: { initial?: string }) {
  const [code, setCode] = useState(initial);
  current = code;
  return createElement(CountryCombobox, { label: 'Country', value: code, countries, onChange: setCode });
}

const input = () => host.querySelector('input') as HTMLInputElement;
const options = () => Array.from(host.querySelectorAll('[role=option]')).map((o) => o.textContent);

function type(text: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input(), text);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function key(k: string) {
  act(() => {
    input().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  });
}

function blur() {
  act(() => {
    input().focus();
    input().blur();
  });
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  current = undefined;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function mount(initial?: string) {
  act(() => root.render(createElement(Harness, { initial })));
}

describe('CountryCombobox', () => {
  it('is a labelled combobox that controls a listbox', () => {
    mount('PH');
    const el = input();
    expect(el.getAttribute('role')).toBe('combobox');
    expect(el.getAttribute('aria-autocomplete')).toBe('list');
    expect(el.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector(`[id="${el.getAttribute('aria-controls')}"]`)?.getAttribute('role')).toBe('listbox');
    expect(host.querySelector(`label[for="${el.id}"]`)?.textContent).toBe('Country');
    expect(el.value).toBe('Philippines');
  });

  it('filters while typing and selects with ArrowDown then Enter', () => {
    mount();
    type('phil');
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(options()).toEqual(['PhilippinesPH']);
    key('ArrowDown');
    key('Enter');
    expect(current).toBe('PH');
    expect(input().value).toBe('Philippines');
    expect(input().getAttribute('aria-expanded')).toBe('false');
  });

  it('moves the active option with the arrow keys', () => {
    mount();
    type('p');
    expect(options()).toEqual(['PhilippinesPH', 'PolandPL']);
    expect(input().getAttribute('aria-activedescendant')).toContain('PH');
    key('ArrowDown');
    expect(input().getAttribute('aria-activedescendant')).toContain('PL');
    key('ArrowUp');
    expect(input().getAttribute('aria-activedescendant')).toContain('PH');
  });

  it('shows a message when nothing matches', () => {
    mount();
    type('zzzz');
    expect(options()).toEqual([]);
    expect(host.textContent).toContain('No matching country');
  });

  it('Escape closes the list and restores the selected name', () => {
    mount('US');
    type('pol');
    key('Escape');
    expect(input().value).toBe('United States');
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(current).toBe('US');
  });

  it('restores the selected name when focus leaves with other text', () => {
    mount('US');
    type('pol');
    blur();
    expect(input().value).toBe('United States');
    expect(current).toBe('US');
  });

  it('clears the country when the text is emptied and focus leaves', () => {
    mount('US');
    type('');
    blur();
    expect(current).toBeUndefined();
    expect(input().value).toBe('');
  });

  it('opens as an empty search and restores the name when nothing is picked', () => {
    mount('US');
    act(() => input().click());
    expect(input().value).toBe('');
    expect(input().placeholder).toBe('United States');
    blur();
    expect(input().value).toBe('United States');
    expect(current).toBe('US');
  });

  it('selects an option on click', () => {
    mount();
    type('pol');
    act(() => {
      (host.querySelector('[role=option]') as HTMLElement).click();
    });
    expect(current).toBe('PL');
    expect(input().value).toBe('Poland');
  });
});
