// What this file is: an accessible country picker (ARIA combobox with a listbox). The user types to filter and sees a flag beside each country.
// In plain terms: a country box you can type in. It shows matches with flags and works with the keyboard.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ChevronDown, Globe } from 'lucide-react';
import { fieldInputClass, fieldLabelClass } from '../../../src/components/ui/primitives';
import { filterCountries, flagUrl } from '../lib/countries';
import type { Country } from '../lib/countries';

// 1px inset ring so a white flag stays visible on a white page.
const flagClass = 'shrink-0 rounded-[2px] ring-1 ring-inset ring-slate-900/15 dark:ring-white/20';

function Flag({ code }: { code: string }) {
  const src = flagUrl(code);
  if (!src) return <span className="inline-block h-[15px] w-5 shrink-0" />;
  return <img src={src} alt="" width={20} height={15} loading="lazy" className={flagClass} />;
}

/**
 * Country field. `value` is an ISO code; `onChange` gets the new code, or
 * undefined when the user clears the text and leaves the field.
 * In plain terms: the Country box on the address form.
 */
export function CountryCombobox({
  label,
  value,
  countries,
  onChange,
}: {
  label: string;
  value: string | undefined;
  countries: Country[];
  onChange: (code: string | undefined) => void;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const optionId = (code: string) => `${id}-opt-${code}`;
  const selectedName = countries.find((c) => c.code === value)?.name ?? '';
  const [text, setText] = useState(selectedName);
  // False until the user types. While false the list shows every country.
  const [typed, setTyped] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // Follow the stored value when it changes from outside.
  useEffect(() => {
    setText(selectedName);
    setTyped(false);
  }, [selectedName]);

  const matches = useMemo(() => filterCountries(countries, typed ? text : ''), [countries, typed, text]);
  const activeCountry = open ? matches[active] : undefined;

  // Keep the active option inside the scroll area.
  useEffect(() => {
    if (!activeCountry) return;
    listRef.current?.querySelector(`[id="${optionId(activeCountry.code)}"]`)?.scrollIntoView?.({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCountry]);

  function select(country: Country) {
    setText(country.name);
    setTyped(false);
    setOpen(false);
    onChange(country.code);
  }

  // Closes the list and puts the stored name back. An empty box clears the country.
  function settle() {
    setOpen(false);
    setTyped(false);
    if (text.trim() === '') {
      setText('');
      if (value !== undefined) onChange(undefined);
    } else {
      setText(selectedName);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(Math.max(0, matches.findIndex((c) => c.code === value)));
      } else {
        setActive((i) => Math.min(i + 1, matches.length - 1));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open) {
        e.preventDefault();
        if (activeCountry) select(activeCountry);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        setTyped(false);
        setText(selectedName);
      }
    }
    // Home and End move the text cursor, as in any text box.
  }

  const flagCode = !typed && value && flagUrl(value) ? value : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={fieldLabelClass}>
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center text-slate-500 dark:text-slate-400">
          {flagCode ? <Flag code={flagCode} /> : <Globe size={16} aria-hidden="true" />}
        </span>
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeCountry ? optionId(activeCountry.code) : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setTyped(true);
            setOpen(true);
            setActive(0);
          }}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onBlur={settle}
          className={`${fieldInputClass} w-full pl-10 pr-9`}
        />
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400"
        />
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label={label}
          hidden={!open}
          // Keeps focus in the input when the user clicks or drags the list's scroll bar.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-300 bg-white py-1 dark:border-slate-600 dark:bg-slate-900"
        >
          {matches.map((c, i) => (
            <li
              key={c.code}
              id={optionId(c.code)}
              role="option"
              aria-selected={c.code === value}
              onMouseMove={() => i !== active && setActive(i)}
              onClick={() => select(c)}
              className={`flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 ${
                i === active ? 'bg-slate-100 dark:bg-slate-800' : ''
              } ${c.code === value ? 'font-medium' : ''}`}
            >
              <Flag code={c.code} />
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{c.code}</span>
            </li>
          ))}
          {matches.length === 0 && (
            <li role="presentation" className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
              No matching country
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
