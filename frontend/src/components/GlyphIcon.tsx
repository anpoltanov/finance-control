import { isMaterialSymbol } from "../utils/icons";

interface GlyphIconProps {
  icon?: string | null;
  className?: string;
  fallback?: string;
}

export default function GlyphIcon({ icon, className, fallback = "" }: GlyphIconProps) {
  if (isMaterialSymbol(icon)) {
    return (
      <span className={`material-symbols-outlined${className ? ` ${className}` : ""}`} aria-hidden="true">
        {icon}
      </span>
    );
  }
  const text = icon || fallback;
  if (!text) return null;
  return (
    <span className={`glyph-fallback${className ? ` ${className}` : ""}`} aria-hidden="true">
      {text}
    </span>
  );
}
