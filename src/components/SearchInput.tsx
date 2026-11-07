import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cx } from '../lib/util';

interface Props {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  className?: string;
  large?: boolean;
}

/** Search field that updates its value (e.g. ?q=) as you type, debounced. */
export default function SearchInput({ value, placeholder, onChange, inputRef, className, large }: Props) {
  const [text, setText] = useState(value);
  const typing = useRef(false);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!typing.current) setText(value);
  }, [value]);
  useEffect(() => {
    if (!typing.current) return;
    const t = setTimeout(() => {
      typing.current = false;
      if (text.trim() !== value) cb.current(text.trim());
    }, 350);
    return () => clearTimeout(t);
  }, [text, value]);

  return (
    <form
      role="search"
      className={cx('max-w-2xl', className)}
      onSubmit={(e) => {
        e.preventDefault();
        typing.current = false;
        cb.current(text.trim());
        (document.activeElement as HTMLElement | null)?.blur();
      }}
    >
      <div className={cx('flex items-center gap-3 rounded-full bg-surface pr-1.5 pl-4 ring-1 ring-white/5 transition focus-within:ring-white/25', large ? 'h-14 pl-5' : 'h-12')}>
        <Search className="size-[18px] shrink-0 text-muted" />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => {
            typing.current = true;
            setText(e.target.value);
          }}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder={placeholder}
          aria-label={placeholder}
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint md:text-[15px] [&::-webkit-search-cancel-button]:hidden"
        />
        {text && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              typing.current = false;
              setText('');
              cb.current('');
            }}
            className="grid size-9 place-items-center rounded-full text-muted hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </form>
  );
}
