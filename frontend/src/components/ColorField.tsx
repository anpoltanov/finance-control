import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface ColorFieldProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

function normalizeHex(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  if (!value.startsWith("#")) value = `#${value}`;
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    value = `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  return null;
}

export default function ColorField({ value, onChange, id }: ColorFieldProps) {
  const { t } = useTranslation();
  const [hex, setHex] = useState(value);

  useEffect(() => {
    setHex(value);
  }, [value]);

  function commit() {
    const next = normalizeHex(hex);
    if (next) {
      setHex(next);
      onChange(next);
      return;
    }
    setHex(value);
  }

  const pickerValue = normalizeHex(value) || "#6366f1";

  return (
    <div className="color-field">
      <input
        id={id}
        type="color"
        value={pickerValue}
        onChange={(e) => {
          setHex(e.target.value);
          onChange(e.target.value);
        }}
        aria-label={t("common.color")}
      />
      <input
        type="text"
        className="color-field-hex"
        value={hex}
        spellCheck={false}
        maxLength={7}
        onChange={(e) => setHex(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        aria-label={t("common.hex")}
      />
    </div>
  );
}
