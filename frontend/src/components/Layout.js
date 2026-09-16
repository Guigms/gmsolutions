import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { MONTHS } from "@/utils/format";
import { LayoutDashboard, Users, BarChart3, LogOut, Sun, Moon, Menu, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/clientes", label: "Clientes", icon: Users, testid: "nav-clients" },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3, testid: "nav-reports" },
];

const NavItems = ({ onNavigate }) => (
  <nav className="flex flex-col gap-1 px-3">
    {NAV.map(({ to, label, icon: Icon, testid }) => (
      <NavLink
        key={to}
        to={to}
        end={to === "/"}
        onClick={onNavigate}
        data-testid={testid}
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            isActive
              ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`
        }
      >
        <Icon className="h-4 w-4" />
        {label}
      </NavLink>
    ))}
  </nav>
);

const MonthYearSelector = () => {
  const { year, setYear, month, setMonth } = useApp();
  const now = new Date();
  const years = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  return (
    <div className="flex items-center gap-2">
      <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
        <SelectTrigger data-testid="month-selector" className="w-[130px] h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MONTHS.map((m, i) => (
            <SelectItem key={m} value={String(i + 1)} data-testid={`month-option-${i + 1}`}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
        <SelectTrigger data-testid="year-selector" className="w-[96px] h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)} data-testid={`year-option-${y}`}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export const Layout = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useApp();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-slate-950">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 z-30">
        <div className="flex items-center gap-2.5 px-6 h-16 border-b border-slate-200 dark:border-slate-800">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 dark:bg-emerald-500">
            <Wallet className="h-5 w-5 text-white dark:text-slate-950" />
          </div>
          <span className="font-heading text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            MensaliPay
          </span>
        </div>
        <div className="py-4 flex-1">
          <NavItems />
        </div>
        <div className="border-t border-slate-200 dark:border-slate-800 p-4">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate" data-testid="sidebar-user-name">
            {user?.name}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
          <Button
            data-testid="logout-button"
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="mt-3 w-full justify-start gap-2 text-slate-600 dark:text-slate-300"
          >
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>
      </aside>

      <div className="lg:pl-64 flex flex-col min-h-screen">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 backdrop-blur-md px-4 sm:px-6 dark:border-slate-800 dark:bg-slate-900/90">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button data-testid="mobile-menu-button" variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 pt-6">
              <div className="flex items-center gap-2.5 px-6 pb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 dark:bg-emerald-500">
                  <Wallet className="h-4 w-4 text-white dark:text-slate-950" />
                </div>
                <span className="font-heading text-lg font-extrabold">MensaliPay</span>
              </div>
              <NavItems onNavigate={() => setMenuOpen(false)} />
              <div className="mt-6 px-6">
                <Button data-testid="logout-button-mobile" variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
                  <LogOut className="h-4 w-4" /> Sair
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <div className="flex-1" />
          <MonthYearSelector />
          <Button data-testid="theme-toggle-button" variant="ghost" size="icon" onClick={toggleTheme}>
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
