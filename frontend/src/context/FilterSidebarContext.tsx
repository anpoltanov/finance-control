import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

interface FilterSidebarContextValue {
  setFilterContent: (content: ReactNode | null) => void;
}

const FilterSidebarContext = createContext<FilterSidebarContextValue | null>(null);

interface FilterSidebarProviderProps {
  header: ReactNode;
  children: ReactNode;
}

export function FilterSidebarProvider({ header, children }: FilterSidebarProviderProps) {
  const { t } = useTranslation();
  const [filterContent, setFilterContent] = useState<ReactNode | null>(null);
  const value = useMemo(() => ({ setFilterContent }), []);

  return (
    <FilterSidebarContext.Provider value={value}>
      <div className="app-layout">
        {header}
        <div className="app-body">
          {filterContent && (
            <aside className="filter-sidebar" aria-label={t("filters.title")}>
              <h3 className="filter-sidebar-title">{t("filters.title")}</h3>
              {filterContent}
            </aside>
          )}
          <main className="content-area">{children}</main>
        </div>
      </div>
    </FilterSidebarContext.Provider>
  );
}

export function useFilterSidebar(content: ReactNode | null, deps: unknown[] = []) {
  const ctx = useContext(FilterSidebarContext);
  if (!ctx) throw new Error("useFilterSidebar must be used within FilterSidebarProvider");

  useEffect(() => {
    ctx.setFilterContent(content);
    return () => ctx.setFilterContent(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, ...deps]);
}
