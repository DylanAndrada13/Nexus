"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Swords, Trophy } from "lucide-react";
import type { TournamentCard } from "@/lib/queries/public";
import { MODALITY_LABELS, type Modality } from "@/lib/constants";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { StatusBadge } from "@/components/ui";

export function FeaturedCarousel({ tournaments }: { tournaments: TournamentCard[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  if (tournaments.length === 0) return null;

  function handleScroll() {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    const next = Math.round(track.scrollLeft / track.clientWidth);
    setActive(Math.min(tournaments.length - 1, Math.max(0, next)));
  }

  function goTo(index: number) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: index * track.clientWidth, behavior: "smooth" });
    setActive(index);
  }

  return (
    <div className="hero-carousel reveal reveal-delay-2">
      <div
        ref={trackRef}
        className="hero-carousel-track"
        onScroll={handleScroll}
        aria-label="Torneos destacados"
      >
        {tournaments.map((tournament) => {
          const occupiedPercent = Math.min(
            100,
            Math.round((tournament.occupancy.occupied / tournament.maxTeams) * 100),
          );
          const prize =
            tournament.prizePool > 0
              ? formatCurrency(tournament.prizePool)
              : "A definir";

          return (
            <div key={tournament.id} className="hero-slide">
              <div className="hidden md:block">
                <article className="hero-slide-card">
                  <div className="hero-slide-art" aria-hidden="true">
                    {tournament.bannerUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={tournament.bannerUrl} alt="" />
                    ) : null}
                  </div>
                  <span className="hero-watermark" aria-hidden="true">
                    NEXUS
                  </span>

                  <div className="hero-slide-content">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={tournament.status} />
                      <span className="badge badge-tier badge-flame">
                        <Trophy size={9} aria-hidden="true" />
                        {MODALITY_LABELS[tournament.modality as Modality]}
                      </span>
                      <span className="mono ml-auto hidden items-center gap-1.5 text-[8.5px] uppercase tracking-[0.1em] text-[#c8bcc0] sm:inline-flex">
                        <CalendarDays size={11} aria-hidden="true" />
                        {formatDate(tournament.startsAt)} · {formatTime(tournament.startsAt)}
                      </span>
                    </div>

                    <div className="mt-auto pt-16">
                      <Link href={`/torneos/${tournament.slug}`} className="group block">
                        <h2 className="display text-[clamp(2.1rem,4.4vw,3.15rem)] leading-[0.92] text-white transition-colors group-hover:text-flame-soft">
                          {tournament.name}
                        </h2>
                      </Link>
                      <p className="mt-2 line-clamp-2 max-w-[34ch] text-[12px] leading-relaxed text-[#c7bbc0] md:text-[13px]">
                        {tournament.description}
                      </p>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <div className="hero-info-box">
                          <p className="hero-info-label">Bolsa de premios</p>
                          <p className="hero-info-value text-flame-soft">
                            {prize}
                          </p>
                        </div>
                        <div className="hero-info-box">
                          <div className="flex items-center justify-between gap-2">
                            <p className="hero-info-label">Cupos libres</p>
                            <p className="mono text-[9px] text-[#cfc2c7]">
                              {tournament.occupancy.available}/{tournament.maxTeams}
                            </p>
                          </div>
                          <div className="progress-track mt-2">
                            <div
                              className="progress-fill"
                              style={{ width: `${occupiedPercent}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <Link
                        href={`/torneos/${tournament.slug}${tournament.registrationOpen ? "#inscripcion" : ""}`}
                        className="btn btn-primary btn-block mt-3.5"
                      >
                        {tournament.registrationOpen ? (
                          <>
                            Inscribir equipo
                            <Swords size={14} aria-hidden="true" />
                          </>
                        ) : (
                          <>
                            Ver torneo
                            <ArrowRight size={14} aria-hidden="true" />
                          </>
                        )}
                      </Link>
                    </div>
                  </div>
                </article>
              </div>

              <div className="md:hidden">
                <article className="mobile-tournament-card">
                  <div className="relative z-[1] flex flex-wrap items-center justify-between gap-2">
                    <StatusBadge status={tournament.status} />
                    <span className="mono inline-flex items-center gap-1.5 text-[8px] uppercase tracking-[0.08em] text-[#b3a7ac]">
                      <CalendarDays size={10} aria-hidden="true" />
                      {formatDate(tournament.startsAt)} · {formatTime(tournament.startsAt)}
                    </span>
                  </div>

                  <Link
                    href={`/torneos/${tournament.slug}`}
                    className="relative z-[1] mt-4 block"
                  >
                    <h2 className="mobile-tournament-pill">{tournament.name}</h2>
                  </Link>

                  <p className="relative z-[1] mt-2.5 line-clamp-2 text-[11.5px] leading-relaxed text-[#a89ba0]">
                    {tournament.description}
                  </p>

                  <div className="mobile-tournament-art" aria-hidden="true">
                    {tournament.bannerUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={tournament.bannerUrl} alt="" />
                    ) : null}
                    <span className="mobile-tournament-watermark">NEXUS</span>
                    <Trophy
                      size={46}
                      strokeWidth={1}
                      className="relative z-[1] text-flame/30"
                    />
                  </div>

                  <div className="relative z-[1] grid grid-cols-2 gap-3 border-t border-white/[0.08] pt-3">
                    <div>
                      <p className="mobile-tournament-label">Premio</p>
                      <p className="mobile-tournament-value text-flame-soft">
                        {prize}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="mobile-tournament-label">Cupos libres</p>
                      <p className="mobile-tournament-value">
                        {tournament.occupancy.available}/{tournament.maxTeams}
                      </p>
                    </div>
                  </div>

                  <div className="progress-track relative z-[1] mt-2.5">
                    <div
                      className="progress-fill"
                      style={{ width: `${occupiedPercent}%` }}
                    />
                  </div>

                  <Link
                    href={`/torneos/${tournament.slug}${tournament.registrationOpen ? "#inscripcion" : ""}`}
                    className="btn btn-primary btn-block relative z-[1] mt-3.5"
                  >
                    {tournament.registrationOpen ? (
                      <>
                        Inscribir equipo
                        <Swords size={14} aria-hidden="true" />
                      </>
                    ) : (
                      <>
                        Ver torneo
                        <ArrowRight size={14} aria-hidden="true" />
                      </>
                    )}
                  </Link>
                </article>
              </div>
            </div>
          );
        })}
      </div>

      {tournaments.length > 1 ? (
        <div className="hero-dots" role="group" aria-label="Seleccionar torneo destacado">
          {tournaments.map((tournament, index) => (
            <button
              key={tournament.id}
              type="button"
              className="hero-dot"
              data-active={index === active ? "true" : "false"}
              onClick={() => goTo(index)}
              aria-label={`Ver ${tournament.name}`}
              aria-current={index === active ? "true" : undefined}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
