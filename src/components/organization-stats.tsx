import { Medal, Swords, Trophy, Users } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/format";

export type OrganizationStatsData = {
  finishedTournaments: number;
  teamsParticipating: number;
  prizesDelivered: number;
  playersRegistered: number;
};

export function OrganizationStats({
  stats,
  className = "",
}: {
  stats: OrganizationStatsData;
  className?: string;
}) {
  return (
    <div className={`stat-grid ${className}`}>
      <div className="stat-card">
        <span className="stat-icon">
          <Trophy size={13} aria-hidden="true" />
        </span>
        <div className="stat-number">{formatNumber(stats.finishedTournaments)}</div>
        <p className="stat-label">Torneos realizados</p>
        <p className="stat-hint">Resultados publicados</p>
      </div>
      <div className="stat-card">
        <span className="stat-icon">
          <Users size={13} aria-hidden="true" />
        </span>
        <div className="stat-number">{formatNumber(stats.teamsParticipating)}</div>
        <p className="stat-label">Equipos participantes</p>
        <p className="stat-hint">Inscripciones confirmadas</p>
      </div>
      <div className="stat-card">
        <span className="stat-icon">
          <Medal size={13} aria-hidden="true" />
        </span>
        <div className="stat-number text-[clamp(1.25rem,2.6vw,2.05rem)]">
          {formatCurrency(stats.prizesDelivered)}
        </div>
        <p className="stat-label">Premios entregados</p>
        <p className="stat-hint">Según actas publicadas</p>
      </div>
      <div className="stat-card">
        <span className="stat-icon">
          <Swords size={13} aria-hidden="true" />
        </span>
        <div className="stat-number">{formatNumber(stats.playersRegistered)}</div>
        <p className="stat-label">Jugadores registrados</p>
        <p className="stat-hint">Cuentas activas</p>
      </div>
    </div>
  );
}
