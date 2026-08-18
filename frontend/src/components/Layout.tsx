import { Outlet } from "react-router-dom";
import AppHeader from "./AppHeader";
import { AddTransactionProvider } from "../context/AddTransactionContext";
import { FilterSidebarProvider } from "../context/FilterSidebarContext";

export default function Layout() {
  return (
    <AddTransactionProvider>
      <FilterSidebarProvider header={<AppHeader />}>
        <Outlet />
      </FilterSidebarProvider>
    </AddTransactionProvider>
  );
}
