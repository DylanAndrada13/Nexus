import Link from "next/link";
import { Bell, LogOut, Search } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/dal";
import { getUnreadNotificationCount } from "@/lib/queries/captain";
import { logoutAction } from "@/actions/auth";
import { Logo } from "@/components/logo";
import { NavLinks } from "@/components/nav-links";
import { MobileMenu } from "@/components/mobile-menu";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export async function SiteHeader() {
  const user = await getCurrentUser();
  const unread = user ? await getUnreadNotificationCount(user.id) : 0;

  return (
    <>
      <header className="site-header">
        <div className="container-nexus site-header-inner relative flex h-[68px] items-center gap-3 md:h-[76px] md:gap-5">
          <div className="site-header-brand">
            <Logo />
          </div>

          <form
            action="/torneos"
            method="get"
            className="search-box ml-4 hidden w-[230px] lg:flex"
            role="search"
          >
            <Search size={14} className="shrink-0" aria-hidden="true" />
            <input
              type="search"
              name="q"
              placeholder="Buscar torneo…"
              aria-label="Buscar torneos"
            />
          </form>

          <NavLinks className="hidden md:flex" />

          <div className="ml-auto hidden items-center gap-2.5 md:flex">
            {user ? (
              <>
                <Link
                  href="/panel/notificaciones"
                  className="relative grid h-9 w-9 place-items-center rounded-md text-muted transition-colors hover:bg-white/5 hover:text-white"
                  aria-label={`Notificaciones${unread ? `: ${unread} sin leer` : ""}`}
                >
                  <Bell size={17} strokeWidth={1.8} />
                  {unread > 0 ? (
                    <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-flame px-1 text-[8px] font-bold leading-none text-white">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  ) : null}
                </Link>

                <Link
                  href={user.role === "ADMIN" ? "/admin" : "/panel"}
                  className="profile-chip"
                >
                  <span className="avatar" aria-hidden="true">
                    {initials(user.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block max-w-[132px] truncate text-[12px] font-medium leading-tight text-white">
                      {user.name}
                    </span>
                    <span className="mono mt-0.5 block text-[7.5px] uppercase tracking-[0.12em] text-flame-soft">
                      {user.role === "ADMIN" ? "Administrador" : "Capitán"}
                    </span>
                  </span>
                </Link>

                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="btn btn-ghost btn-sm"
                    title="Cerrar sesión"
                  >
                    <LogOut size={15} />
                    <span className="sr-only">Cerrar sesión</span>
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login" className="btn btn-ghost btn-sm">
                  Ingresar
                </Link>
                <Link href="/registro" className="btn btn-primary btn-sm">
                  Crear cuenta
                </Link>
              </>
            )}
          </div>

          <div className="site-header-mobile-actions ml-auto flex items-center gap-2 md:hidden">
            {user ? (
              <Link
                href="/panel/notificaciones"
                className="relative grid h-10 w-10 place-items-center rounded-md border border-line bg-white/[0.025] text-muted"
                aria-label={`Notificaciones${unread ? `: ${unread} sin leer` : ""}`}
              >
                <Bell size={17} strokeWidth={1.8} />
                {unread > 0 ? (
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-flame shadow-[0_0_8px_rgba(255,65,65,.8)]" />
                ) : null}
              </Link>
            ) : null}
            <MobileMenu
              user={user ? { name: user.name, role: user.role } : null}
              unread={unread}
            />
          </div>
        </div>
      </header>

      <MobileBottomNav
        user={user ? { name: user.name, role: user.role } : null}
        unread={unread}
      />
    </>
  );
}
