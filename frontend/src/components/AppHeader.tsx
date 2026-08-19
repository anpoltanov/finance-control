import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAddTransaction } from "../context/AddTransactionContext";
import { setLocale, type AppLocale } from "../i18n";
import { readTheme, setTheme, type ThemeMode } from "../theme";
import GlyphIcon from "./GlyphIcon";

const navItems = [
  { to: "/", key: "nav.dashboard", end: true },
  { to: "/transactions", key: "nav.transactions" },
  { to: "/budgets", key: "nav.budgets" },
  { to: "/planned", key: "nav.planned" },
  { to: "/reports", key: "nav.reports" },
] as const;

export default function AppHeader() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { openAddTransaction } = useAddTransaction();
  const locale = i18n.language as AppLocale;
  const [username, setUsername] = useState("");
  const [theme, setThemeState] = useState<ThemeMode>(() => readTheme());
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.me().then((me) => setUsername(me.username)).catch(() => setUsername(""));
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function logout() {
    await api.logout();
    navigate("/login");
  }

  function switchLocale(next: AppLocale) {
    if (next !== locale) setLocale(next);
  }

  function toggleTheme() {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }

  const initial = (username || "?").slice(0, 1).toUpperCase();

  return (
    <header className="app-header">
      <div className="app-header-brand">{t("app.title")}</div>
      <nav className="app-header-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={"end" in item ? item.end : undefined}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            {t(item.key)}
          </NavLink>
        ))}
        <NavLink to="/settings" className={({ isActive }) => (isActive ? "active settings-link" : "settings-link")} title={t("nav.settings")}>
          <GlyphIcon icon="settings" />
          <span className="settings-link-label">{t("nav.settings")}</span>
        </NavLink>
      </nav>
      <div className="app-header-actions">
        <div className="locale-toggle" role="group" aria-label="Language">
          <button type="button" className={locale === "ru" ? "active" : "secondary"} onClick={() => switchLocale("ru")}>
            RU
          </button>
          <button type="button" className={locale === "en" ? "active" : "secondary"} onClick={() => switchLocale("en")}>
            EN
          </button>
        </div>
        <button
          type="button"
          className="secondary theme-toggle"
          onClick={toggleTheme}
          title={t(theme === "dark" ? "theme.switchToLight" : "theme.switchToDark")}
          aria-label={t(theme === "dark" ? "theme.switchToLight" : "theme.switchToDark")}
        >
          <span aria-hidden="true">
            <GlyphIcon icon={theme === "dark" ? "light_mode" : "dark_mode"} />
          </span>
        </button>
        <button type="button" className="header-add-btn" onClick={() => openAddTransaction()}>
          + {t("nav.add")}
        </button>
        <div className="user-menu" ref={menuRef}>
          <button
            type="button"
            className="user-menu-trigger secondary"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="user-avatar" aria-hidden="true">{initial}</span>
            <span className="user-menu-name">{username || t("nav.account")}</span>
          </button>
          {menuOpen && (
            <div className="user-menu-dropdown" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  navigate("/settings");
                }}
              >
                {t("nav.settings")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
              >
                {t("nav.logout")}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
