import type { ReactNode } from "react";
import { NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  FAMILIS_USER_KEY,
  getStoredRole,
  isAdminRole,
  performLogout,
} from "../RequireAuth";
import { BrandStripButton } from "./shell/BrandMark";
import { useSidebarCollapse, type ShellVariant } from "./shell/useSidebarCollapse";

interface StoredUser {
  username?: string;
  email?: string;
}

function getStoredUser(): StoredUser {
  try {
    const raw = localStorage.getItem(FAMILIS_USER_KEY);
    if (!raw) return {};
    const u = JSON.parse(raw) as StoredUser;
    return {
      username: typeof u.username === "string" ? u.username : undefined,
      email: typeof u.email === "string" ? u.email : undefined,
    };
  } catch {
    return {};
  }
}

function IconHome({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3.2 3.5 10.5h2.3V20h4.4v-5.2h3.6V20h4.4v-9.5h2.3L12 3.2Z" />
    </svg>
  );
}

function IconStats({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V9M12 19V5M20 19v-7" />
    </svg>
  );
}

function IconUsers({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16 19v-1.2A3.8 3.8 0 0 0 12.2 14H7.8A3.8 3.8 0 0 0 4 17.8V19M14.5 8.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM20 19v-1a3.2 3.2 0 0 0-2.2-3M17.5 5.6a2.6 2.6 0 0 1 0 5"
      />
    </svg>
  );
}

function IconParticipants({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 11.5 10.6 13l3.9-4M7.5 5h9A2.5 2.5 0 0 1 19 7.5v9A2.5 2.5 0 0 1 16.5 19h-9A2.5 2.5 0 0 1 5 16.5v-9A2.5 2.5 0 0 1 7.5 5Z"
      />
    </svg>
  );
}

function IconLogout({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 7V5.8A1.8 1.8 0 0 1 11.8 4h6.4A1.8 1.8 0 0 1 20 5.8v12.4A1.8 1.8 0 0 1 18.2 20h-6.4A1.8 1.8 0 0 1 10 18.2V17M4 12h10M7 9l-3 3 3 3"
      />
    </svg>
  );
}

function IconSidebarToggle({ className, collapsed }: { className?: string; collapsed: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      {collapsed ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
      )}
    </svg>
  );
}

type NavKey = "food" | "stats" | "users" | "participants";

function useActiveNav(): NavKey | null {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const path = location.pathname;

  if (path.startsWith("/admin/users")) return "users";
  if (path.startsWith("/participants")) return "participants";
  if (path === "/dashboard") {
    return searchParams.get("tab") === "stats" ? "stats" : "food";
  }
  return null;
}

interface PageHeaderProps {
  children: ReactNode;
  /** Initial default when the user has not saved a sidebar preference yet. */
  variant?: ShellVariant;
  /**
   * `full` — admin/staff shell with nav + account footer.
   * `minimal` — brand strip + collapse only (e.g. Login).
   */
  shell?: "full" | "minimal";
  onLogoClick?: () => void;
  logoAriaLabel?: string;
  /** When set, renders a thin top bar above page content (collapsed flows). */
  backLabel?: string;
  backTo?: string;
  onBack?: () => void;
}

export function PageHeader({
  children,
  variant = "expanded",
  shell = "full",
  onLogoClick,
  logoAriaLabel,
  backLabel,
  backTo = "/dashboard",
  onBack,
}: PageHeaderProps) {
  const navigate = useNavigate();
  const role = getStoredRole();
  const user = getStoredUser();
  const active = useActiveNav();
  const canSeeParticipants = isAdminRole(role);
  const canSeeUsers = role === "admin";
  const canSeeStaffNav = isAdminRole(role);
  const { collapsed, canToggle, toggle } = useSidebarCollapse(variant);
  const isMinimal = shell === "minimal";

  const handleLogo =
    onLogoClick ?? (() => navigate(isMinimal ? "/" : "/dashboard"));
  const handleBack = onBack ?? (() => navigate(backTo));
  const handleLogout = () => performLogout(navigate);

  const navItems: Array<{
    key: NavKey;
    label: string;
    to: string;
    visible: boolean;
    icon: (props: { className?: string }) => ReactNode;
  }> = [
    {
      key: "food",
      label: "Food Management",
      to: "/dashboard",
      visible: canSeeStaffNav,
      icon: IconHome,
    },
    {
      key: "stats",
      label: "Statistics & Analytics",
      to: "/dashboard?tab=stats",
      visible: canSeeStaffNav,
      icon: IconStats,
    },
    {
      key: "users",
      label: "Account Management",
      to: "/admin/users",
      visible: canSeeUsers,
      icon: IconUsers,
    },
    {
      key: "participants",
      label: "Taster Management",
      to: "/participants",
      visible: canSeeParticipants,
      icon: IconParticipants,
    },
  ];

  const visibleNav = navItems.filter((item) => item.visible);
  const displayName = user.username || role || "User";
  const displayEmail = user.email || "";

  return (
    <div
      className="min-h-screen bg-[#f6f7fb] flex"
      style={{ fontFamily: "'Montserrat', sans-serif" }}
    >
      <aside
        className={`
          sticky top-0 h-screen shrink-0 flex flex-col bg-white shadow-[0px_4px_4px_0px_rgba(0,0,0,0.15)] z-30
          transition-[width] duration-200 ease-out
          ${collapsed ? "w-[72px] sm:w-[88px]" : "w-[240px] sm:w-[280px] lg:w-[320px]"}
        `}
      >
        <BrandStripButton
          collapsed={collapsed}
          onClick={handleLogo}
          ariaLabel={logoAriaLabel ?? (isMinimal ? "Go to home" : "Go to dashboard")}
        />

        {isMinimal ? (
          <div className="flex-1" />
        ) : (
          <nav className={`flex-1 overflow-y-auto py-4 ${collapsed ? "px-2" : "px-3 sm:px-4"}`}>
            <ul className="space-y-1">
              {visibleNav.map((item) => {
                const isActive = active === item.key;
                const Icon = item.icon;
                return (
                  <li key={item.key}>
                    <NavLink
                      to={item.to}
                      title={item.label}
                      className={`
                        flex items-center rounded-md transition-colors
                        ${collapsed ? "justify-center p-2.5" : "justify-between gap-3 px-3 py-3"}
                        ${
                          isActive
                            ? "text-[#e8174a] font-semibold"
                            : "text-gray-900 font-semibold hover:bg-gray-50"
                        }
                      `}
                    >
                      {!collapsed ? (
                        <span className="text-[15px] sm:text-[17px] leading-snug">{item.label}</span>
                      ) : null}
                      <Icon
                        className={`shrink-0 ${collapsed ? "w-6 h-6" : "w-5 h-5 sm:w-6 sm:h-6"} ${
                          isActive ? "text-[#e8174a]" : "text-gray-800"
                        }`}
                      />
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        {canToggle ? (
          <div className={`shrink-0 ${collapsed ? "px-2 pb-2" : "px-3 sm:px-4 pb-2"}`}>
            <button
              type="button"
              onClick={toggle}
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={`
                w-full flex items-center rounded-md text-gray-900 font-semibold hover:bg-gray-50 transition-colors
                ${collapsed ? "justify-center p-2.5" : "justify-between gap-3 px-3 py-3"}
              `}
            >
              {!collapsed ? (
                <span className="text-[15px] sm:text-[17px] leading-snug">Collapse</span>
              ) : null}
              <IconSidebarToggle
                collapsed={collapsed}
                className={`shrink-0 text-gray-800 ${collapsed ? "w-6 h-6" : "w-5 h-5 sm:w-6 sm:h-6"}`}
              />
            </button>
          </div>
        ) : null}

        {!isMinimal ? (
          <div className={`border-t border-gray-200 shrink-0 ${collapsed ? "p-2" : "px-4 py-4"}`}>
            {collapsed ? (
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center p-2.5 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                aria-label="Log out"
                title="Log out"
              >
                <IconLogout className="w-6 h-6" />
              </button>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-[15px] sm:text-[17px] text-gray-900 truncate">{displayName}</p>
                  {displayEmail ? (
                    <p className="text-[13px] sm:text-[15px] text-gray-700 truncate mt-0.5">{displayEmail}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="shrink-0 p-1.5 rounded-md text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                  aria-label="Log out"
                  title="Log out"
                >
                  <IconLogout className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </div>
            )}
          </div>
        ) : null}
      </aside>

      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {backLabel ? (
          <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 sm:px-6 h-[56px] sm:h-[64px] flex items-center shrink-0">
            <button
              type="button"
              onClick={handleBack}
              className="flex items-center gap-2 text-gray-800 hover:text-gray-950 text-[15px] sm:text-[18px] transition-colors"
            >
              <span aria-hidden="true">←</span>
              {backLabel}
            </button>
          </div>
        ) : null}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

interface PageTitleProps {
  backLabel?: string;
  backTo?: string;
  onBack?: () => void;
  title: string;
  subtitle?: string;
  /** Hide the in-content back link when the shell already shows a top back bar. */
  hideBack?: boolean;
}

export function PageTitle({
  backLabel = "Back to Dashboard",
  backTo = "/dashboard",
  onBack,
  title,
  subtitle,
  hideBack = false,
}: PageTitleProps) {
  const navigate = useNavigate();
  const handleBack = onBack ?? (() => navigate(backTo));

  return (
    <div className="mb-6">
      {!hideBack ? (
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-800 mb-4 text-sm transition-colors"
        >
          <span aria-hidden="true">←</span>
          {backLabel}
        </button>
      ) : null}
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">{title}</h1>
      {subtitle ? <p className="text-sm text-gray-500 mt-1">{subtitle}</p> : null}
    </div>
  );
}
