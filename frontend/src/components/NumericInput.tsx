import { useLayoutEffect, useRef, type InputHTMLAttributes } from "react";
import {
  caretAfterEdit,
  commitNumericInput,
  finalizeNumericInput,
  formatNumericDisplay,
  normalizeTypedNumeric,
  shouldParseAsPaste,
  type NumericInputOptions,
} from "../utils/numericInput";

type NumericInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "inputMode"> &
  NumericInputOptions & {
    value: string;
    onChange: (value: string) => void;
  };

export default function NumericInput({
  value,
  onChange,
  maxFractionDigits = 2,
  allowNegative = false,
  onBlur,
  onPaste,
  ...rest
}: NumericInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);
  const options = { maxFractionDigits, allowNegative };
  const display = formatNumericDisplay(value);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el || document.activeElement !== el || caretRef.current == null) return;
    const pos = caretRef.current;
    el.setSelectionRange(pos, pos);
  }, [display]);

  function commit(raw: string, caret: number, previousDisplay: string) {
    const pasted = shouldParseAsPaste(raw, previousDisplay);
    const parse = (prefix: string) => (pasted ? commitNumericInput(prefix, options) : normalizeTypedNumeric(prefix, options));
    const next = parse(raw);
    const formatted = formatNumericDisplay(next);
    const pos = caretAfterEdit(raw.slice(0, caret), formatted, parse);
    if (next === value) {
      const el = inputRef.current;
      if (el) {
        el.value = formatted;
        el.setSelectionRange(pos, pos);
      }
      return;
    }
    caretRef.current = pos;
    onChange(next);
  }

  return (
    <input
      {...rest}
      ref={inputRef}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      value={display}
      onChange={(e) => commit(e.target.value, e.target.selectionStart ?? e.target.value.length, display)}
      onPaste={(e) => {
        const pasted = e.clipboardData.getData("text");
        if (!pasted) return;
        e.preventDefault();
        const el = e.currentTarget;
        const start = el.selectionStart ?? display.length;
        const end = el.selectionEnd ?? display.length;
        const nextRaw = `${display.slice(0, start)}${pasted}${display.slice(end)}`;
        const next = commitNumericInput(nextRaw, options);
        const formatted = formatNumericDisplay(next);
        caretRef.current = caretAfterEdit(nextRaw.slice(0, start + pasted.length), formatted, (prefix) =>
          commitNumericInput(prefix, options)
        );
        onChange(next);
        onPaste?.(e);
      }}
      onBlur={(e) => {
        const finalized = finalizeNumericInput(value);
        if (finalized !== value) onChange(finalized);
        onBlur?.(e);
      }}
    />
  );
}
