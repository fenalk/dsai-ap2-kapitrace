'use client';
import { useRef, type KeyboardEvent } from 'react';

export interface TabItem<T extends string> { value: T; label: string; disabled?: boolean }

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** id of the panel the tabs control, when there is one. */
  controls?: string;
  className?: string;
}

/**
 * WAI-ARIA tabs with roving tabindex: only the selected tab is in the Tab order,
 * arrows/Home/End move between tabs and select them.
 */
export default function Tabs<T extends string>({ items, value, onChange, label, controls, className }: TabsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = items.map((item, index) => ({ item, index })).filter(entry => !entry.item.disabled);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const position = enabled.findIndex(entry => entry.item.value === value);
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (position + 1) % enabled.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (position - 1 + enabled.length) % enabled.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = enabled.length - 1;
    if (next === null || enabled.length === 0) return;
    event.preventDefault();
    const target = enabled[next];
    onChange(target.item.value);
    refs.current[target.index]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className={['tabs', className].filter(Boolean).join(' ')} onKeyDown={onKeyDown}>
      {items.map((item, index) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={element => { refs.current[index] = element; }}
            type="button"
            role="tab"
            className="tab"
            aria-selected={selected}
            aria-controls={controls}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
