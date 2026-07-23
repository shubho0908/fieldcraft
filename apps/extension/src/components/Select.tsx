import { Check, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function Select({
  value,
  options,
  onChange,
  placeholder = "Select…",
  disabled,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, options.findIndex((o) => o.value === value)),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const activeId = `${listId}-option-${activeIndex}`;

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const selectedIndex = options.findIndex((o) => o.value === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [value, options]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setActiveIndex((i) => (i + 1) % options.length);
          break;
        case "ArrowUp":
          event.preventDefault();
          setActiveIndex((i) => (i - 1 + options.length) % options.length);
          break;
        case "Home":
          event.preventDefault();
          setActiveIndex(0);
          break;
        case "End":
          event.preventDefault();
          setActiveIndex(options.length - 1);
          break;
        case "Enter":
        case " ":
          event.preventDefault();
          onChange(options[activeIndex].value);
          setOpen(false);
          break;
        case "Escape":
          event.preventDefault();
          setOpen(false);
          break;
        case "Tab":
          setOpen(false);
          break;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, activeIndex, options, onChange]);

  useEffect(() => {
    if (open) {
      const active = document.getElementById(activeId);
      active?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, activeId, open]);

  function toggle() {
    if (disabled) return;
    setOpen((o) => !o);
  }

  function select(option: SelectOption, index: number) {
    onChange(option.value);
    setActiveIndex(index);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((o) => !o);
    }
  }

  return (
    <div className="custom-select" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="custom-select-trigger"
        onClick={toggle}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? activeId : undefined}
        disabled={disabled}
      >
        <span className="custom-select-value">
          {selected?.icon && <span className="custom-select-icon">{selected.icon}</span>}
          <span className="custom-select-label">{selected?.label ?? placeholder}</span>
        </span>
        <ChevronsUpDown size={16} />
      </button>

      {open && (
        <ul id={listId} className="custom-select-menu" role="listbox">
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${listId}-option-${index}`}
              role="option"
              aria-selected={option.value === value}
              className={[
                "custom-select-option",
                option.value === value && "selected",
                index === activeIndex && "active",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => select(option, index)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <span className="custom-select-option-text">
                {option.icon && <span className="custom-select-icon">{option.icon}</span>}
                <span className="custom-select-label">{option.label}</span>
              </span>
              {option.value === value && <Check size={14} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
