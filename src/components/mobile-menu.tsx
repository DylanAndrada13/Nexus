"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import {
  BarChart3,
  Bell,
  ChevronRight,
  Home,
  LogOut,
  Menu,
  Radio,
  Trophy,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { FireParticles } from "@/components/fire-particles";
import { logoutAction } from "@/actions/auth";

type MobileUser = {
  name: string;
  role: string;
} | null;

const mainLinks = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/torneos", label: "Torneos", icon: Trophy },
  { href: "/ranking", label: "Rankings", icon: BarChart3 },
  { href: "/resultados", label: "Resultados", icon: Radio },
  { href: "/#contacto", label: "Contacto", icon: Users },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function roleLabel(role: string) {
  if (role === "ADMIN") return "Administrador";
  if (role === "CAPTAIN") return "Capitán";
  return "Jugador";
}

export function MobileMenu({
  user,
  unread,
}: {
  user: MobileUser;
  unread: number;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);

    const media = window.matchMedia("(min-width: 768px)");
    const onBreakpoint = () => {
      if (media.matches) setOpen(false);
    };
    media.addEventListener("change", onBreakpoint);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      media.removeEventListener("change", onBreakpoint);
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="mobile-navigation"
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        className={`grid h-10 w-10 place-items-center rounded-md border transition-colors ${
          open
            ? "border-flame/50 bg-flame/10 text-white"
            : "border-line bg-white/[0.025] text-white"
        }`}
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>

      {open
        ? createPortal(
            <div
              id="mobile-navigation"
              className="mobile-menu-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="Menú de navegación"
            >
              <FireParticles
                fixed
                count={48}
                className="site-particles mobile-menu-particles"
              />

              <div className="mobile-menu-inner">
                <div className="mobile-menu-topbar">
                  <div onClick={() => setOpen(false)}>
                    <Logo size="md" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="mobile-menu-close"
                    aria-label="Cerrar menú"
                  >
                    <X size={18} strokeWidth={1.9} />
                  </button>
                </div>

                {user ? (
                  <Link
                    href={user.role === "ADMIN" ? "/admin" : "/panel"}
                    onClick={() => setOpen(false)}
                    className="mobile-menu-account"
                  >
                    <span className="avatar" aria-hidden="true">
                      {initials(user.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="mobile-menu-account-title block truncate">
                        {user.name}
                      </span>
                      <span className="mobile-menu-account-sub">
                        {roleLabel(user.role)} · Ir al panel
                      </span>
                    </span>
                    {unread > 0 ? (
                      <span className="mobile-menu-unread">
                        {unread > 9 ? "9+" : unread}
                      </span>
                    ) : null}
                    <ChevronRight
                      size={16}
                      className="mobile-menu-account-arrow"
                      aria-hidden="true"
                    />
                  </Link>
                ) : (
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="mobile-menu-account"
                  >
                    <span className="mobile-menu-account-icon" aria-hidden="true">
                      <UserRound size={17} strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="mobile-menu-account-title block">
                        Iniciar sesión
                      </span>
                      <span className="mobile-menu-account-sub">
                        Accedé a tu cuenta
                      </span>
                    </span>
                    <ChevronRight
                      size={16}
                      className="mobile-menu-account-arrow"
                      aria-hidden="true"
                    />
                  </Link>
                )}

                <nav className="mobile-menu-nav" aria-label="Secciones principales">
                  {mainLinks.map((link) => {
                    const Icon = link.icon;
                    const active =
                      link.href === "/"
                        ? pathname === "/"
                        : pathname === link.href ||
                          pathname.startsWith(`${link.href}/`);

                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setOpen(false)}
                        className="mobile-menu-link"
                        data-active={active ? "true" : "false"}
                        aria-current={active ? "page" : undefined}
                      >
                        <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                        <span className="mobile-menu-link-label">{link.label}</span>
                        <ChevronRight
                          size={15}
                          className="mobile-menu-link-arrow"
                          aria-hidden="true"
                        />
                      </Link>
                    );
                  })}
                </nav>

                <div className="mobile-menu-footer">
                  {user ? (
                    <div className="grid gap-2">
                      <Link
                        href={user.role === "ADMIN" ? "/admin" : "/panel"}
                        onClick={() => setOpen(false)}
                        className="btn btn-primary btn-block"
                      >
                        <UserRound size={15} aria-hidden="true" />
                        {user.role === "ADMIN"
                          ? "Panel administrativo"
                          : "Mi panel"}
                      </Link>
                      <Link
                        href="/panel/notificaciones"
                        onClick={() => setOpen(false)}
                        className="btn btn-secondary btn-block"
                      >
                        <Bell size={15} aria-hidden="true" />
                        Notificaciones
                        {unread > 0 ? (
                          <span className="mobile-menu-unread">
                            {unread > 9 ? "9+" : unread}
                          </span>
                        ) : null}
                      </Link>
                      <form action={logoutAction}>
                        <button type="submit" className="btn btn-secondary btn-block">
                          <LogOut size={15} aria-hidden="true" />
                          Cerrar sesión
                        </button>
                      </form>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        href="/login"
                        onClick={() => setOpen(false)}
                        className="btn btn-secondary btn-block"
                      >
                        Ingresar
                      </Link>
                      <Link
                        href="/registro"
                        onClick={() => setOpen(false)}
                        className="btn btn-primary btn-block"
                      >
                        Crear cuenta
                      </Link>
                    </div>
                  )}

                  <p className="mobile-menu-note">
                    NEXUS FF · Free Fire Argentina
                  </p>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
