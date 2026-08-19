import { useTranslation } from "react-i18next";
import { ICON_SYMBOLS } from "../utils/icons";
import GlyphIcon from "./GlyphIcon";

interface IconPickerProps {
  value: string;
  onChange: (value: string) => void;
}

export default function IconPicker({ value, onChange }: IconPickerProps) {
  const { t } = useTranslation();

  return (
    <div className="icon-picker" role="listbox" aria-label={t("common.chooseIcon")}>
      {ICON_SYMBOLS.map((name) => (
        <button
          key={name}
          type="button"
          role="option"
          aria-selected={value === name}
          className={`icon-picker-btn${value === name ? " selected" : ""}`}
          title={name}
          onClick={() => onChange(name)}
        >
          <GlyphIcon icon={name} />
        </button>
      ))}
    </div>
  );
}
