import Link from "next/link";
import { ShieldCheck, Swords, Trophy, Users } from "lucide-react";
import { Logo } from "@/components/logo";
import { FireParticles } from "@/components/fire-particles";

const features = [
  {
    icon: Trophy,
    title: "Torneos con cupos reales",
    text: "Inscripciones por WhatsApp, cupos y salas gestionados de punta a punta.",
  },
  {
    icon: Users,
    title: "Equipos y plantillas",
    text: "Armá tu equipo, sumá jugadores y administrá cada inscripción desde el panel.",
  },
  {
    icon: ShieldCheck,
    title: "Resultados verificados",
    text: "Tablas oficiales, ranking de temporada e historial competitivo de cada equipo.",
  },
];

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <FireParticles fixed count={54} className="site-particles" />
      <div className="auth-shell relative z-10 flex min-h-screen flex-col">
      <header className="relative z-10 border-b border-white/10">
        <div className="container-nexus flex h-[72px] items-center justify-between gap-4">
          <Logo />
          <Link
            href="/"
            className="mono inline-flex items-center gap-1.5 text-[9px] uppercase tracking-[0.1em] text-[#9b8e93] transition-colors hover:text-white"
          >
            ← Volver al inicio
          </Link>
        </div>
      </header>

      <main id="contenido" className="relative z-10 flex-1">
        <div className="container-nexus grid min-h-full items-center gap-10 py-10 md:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-16 lg:py-16">
          <aside className="hidden min-w-0 lg:block">
            <p className="kicker">Nexus FF · Competitive league</p>
            <h2 className="display mt-5 max-w-xl text-[clamp(3.2rem,5.4vw,5.2rem)]">
              La arena
              <br />
              <span className="text-flame-soft">donde se juega</span>
              <br />
              en serio.
            </h2>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-[#b8adb1]">
              Una sola cuenta para competir, organizar tu equipo y seguir cada
              torneo de Free Fire en Argentina.
            </p>

            <ul className="mt-9 max-w-md space-y-4">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <li key={feature.title} className="flex items-start gap-3">
                    <span className="section-heading-icon mt-0.5">
                      <Icon size={15} strokeWidth={1.9} aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold text-white">{feature.title}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                        {feature.text}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mt-10 flex max-w-md items-center gap-3 border-t border-white/10 pt-5">
              <Swords size={15} className="text-flame-soft" aria-hidden="true" />
              <p className="mono text-[9px] uppercase tracking-[0.11em] text-[#8f8388]">
                Circuito oficial · Temporada {new Date().getFullYear()}
              </p>
            </div>
          </aside>

          <div className="flex w-full min-w-0 justify-center lg:justify-end">
            {children}
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/10">
        <div className="container-nexus flex flex-wrap items-center justify-between gap-2 py-4">
          <p className="mono text-[8px] uppercase tracking-[0.1em] text-[#6f6368]">
            NEXUS FF · Torneos de Free Fire en Argentina
          </p>
          <p className="mono text-[8px] uppercase tracking-[0.1em] text-[#6f6368]">
            © {new Date().getFullYear()}
          </p>
        </div>
      </footer>
      </div>
    </>
  );
}
