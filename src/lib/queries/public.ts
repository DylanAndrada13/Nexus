import "server-only";

import type { Tournament } from "@prisma/client";
import { db } from "@/lib/db";
import { getRanking } from "@/lib/rankings";
import {
  effectiveStatus,
  occupancyFrom,
  registrationWindowOpen,
  type Occupancy,
} from "@/lib/tournaments";
import type { Modality, TournamentStatus } from "@/lib/constants";

export type TournamentCard = {
  id: string;
  slug: string;
  name: string;
  bannerUrl: string | null;
  description: string;
  modality: Modality;
  access: string;
  status: TournamentStatus;
  startsAt: Date;
  maxTeams: number;
  prizePool: number;
  featured: boolean;
  occupancy: Occupancy;
  registrationOpen: boolean;
  registrationReason?: string;
};

type TournamentWithRegs = Tournament & {
  registrations: { status: string }[];
};

function toCard(tournament: TournamentWithRegs, now = new Date()): TournamentCard {
  const occupancy = occupancyFrom(tournament.registrations, tournament.maxTeams);
  const window = registrationWindowOpen(tournament, occupancy, now);
  return {
    id: tournament.id,
    slug: tournament.slug,
    name: tournament.name,
    bannerUrl: tournament.bannerUrl,
    description: tournament.description,
    modality: tournament.modality as Modality,
    access: tournament.access,
    status: effectiveStatus(tournament, occupancy),
    startsAt: tournament.startsAt,
    maxTeams: tournament.maxTeams,
    prizePool: tournament.prizePool,
    featured: tournament.featured,
    occupancy,
    registrationOpen: window.open,
    registrationReason: window.reason,
  };
}

const registrationsSummary = {
  select: { status: true },
} as const;

export async function getUpcomingTournaments(limit = 6): Promise<TournamentCard[]> {
  const now = new Date();
  const tournaments = await db.tournament.findMany({
    where: {
      access: "PUBLIC",
      status: { in: ["UPCOMING", "REGISTRATION_OPEN", "FULL", "ONGOING"] },
      startsAt: { gte: new Date(now.getTime() - 12 * 60 * 60 * 1000) },
    },
    include: { registrations: registrationsSummary },
    orderBy: [{ featured: "desc" }, { startsAt: "asc" }],
    take: limit,
  });
  return tournaments.map((tournament) => toCard(tournament, now));
}

export async function getTournamentList(options: {
  scope?: "proximos" | "finalizados" | "todos";
  modality?: string;
  q?: string;
}): Promise<TournamentCard[]> {
  const now = new Date();
  const scope = options.scope ?? "proximos";
  const query = options.q?.trim().slice(0, 80);
  const modalityFilter =
    options.modality && ["SOLO", "DUO", "SQUAD"].includes(options.modality)
      ? options.modality
      : undefined;

  const tournaments = await db.tournament.findMany({
    where: {
      access: "PUBLIC",
      ...(modalityFilter ? { modality: modalityFilter } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query } },
              { description: { contains: query } },
              { slug: { contains: query } },
            ],
          }
        : {}),
      ...(scope === "finalizados"
        ? { resultsPublishedAt: { not: null } }
        : scope === "proximos"
          ? {
              status: {
                in: ["UPCOMING", "REGISTRATION_OPEN", "FULL", "ONGOING"],
              },
              startsAt: { gte: new Date(now.getTime() - 12 * 60 * 60 * 1000) },
            }
          : { status: { not: "CANCELLED" } }),
    },
    include: { registrations: registrationsSummary },
    orderBy:
      scope === "finalizados"
        ? [{ resultsPublishedAt: "desc" }, { startsAt: "desc" }]
        : [{ startsAt: "asc" }],
    take: 60,
  });

  return tournaments.map((tournament) => toCard(tournament, now));
}

export type TournamentDetail = {
  id: string;
  slug: string;
  name: string;
  bannerUrl: string | null;
  description: string;
  modality: Modality;
  access: string;
  status: TournamentStatus;
  startsAt: Date;
  registrationClosesAt: Date | null;
  whatsappUrl: string | null;
  maxTeams: number;
  prizePool: number;
  prizeDistribution: string;
  rules: string;
  format: string;
  formatDetails: string;
  rounds: number;
  pointsConfig: string;
  allowSubstitutes: boolean;
  featured: boolean;
  resultsPublishedAt: Date | null;
  occupancy: Occupancy;
  registrationOpen: boolean;
  registrationReason?: string;
  participants: {
    registrationId: string;
    teamId: string;
    name: string;
    tag: string;
    logoUrl: string | null;
    roster: { gameName: string; role: string }[];
  }[];
  results: {
    position: number;
    points: number;
    kills: number;
    prize: number;
    mvpName: string | null;
    team: { id: string; name: string; tag: string; logoUrl: string | null };
  }[];
  invitedTeamIds: string[];
};

export async function getTournamentBySlug(
  slug: string,
  viewer: { id: string; role: string } | null,
): Promise<TournamentDetail | null> {
  const tournament = await db.tournament.findUnique({
    where: { slug },
    include: {
      registrations: {
        include: {
          team: {
            select: {
              id: true,
              name: true,
              tag: true,
              logoUrl: true,
              members: {
                select: { gameName: true, role: true },
                orderBy: { joinedAt: "asc" },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      invites: {
        include: { team: { select: { captainId: true } } },
      },      results: {
        include: {
          team: { select: { id: true, name: true, tag: true, logoUrl: true } },
        },
        orderBy: { position: "asc" },
      },
    },
  });

  if (!tournament) return null;

  if (tournament.access === "PRIVATE") {
    const isAdmin = viewer?.role === "ADMIN";
    const isInvited = viewer
      ? tournament.invites.some((invite) => invite.team.captainId === viewer.id)
      : false;
    if (!isAdmin && !isInvited) return null;
  }

  const occupancy = occupancyFrom(
    tournament.registrations,
    tournament.maxTeams,
  );
  const window = registrationWindowOpen(tournament, occupancy);
  const confirmed = tournament.registrations.filter(
    (registration) => registration.status === "CONFIRMED",
  );
  const resultsPublished = Boolean(tournament.resultsPublishedAt);

  return {
    id: tournament.id,
    slug: tournament.slug,
    name: tournament.name,
    bannerUrl: tournament.bannerUrl,
    description: tournament.description,
    modality: tournament.modality as Modality,
    access: tournament.access,
    status: effectiveStatus(tournament, occupancy),
    startsAt: tournament.startsAt,
    registrationClosesAt: tournament.registrationClosesAt,
    whatsappUrl: tournament.whatsappUrl,
    maxTeams: tournament.maxTeams,
    prizePool: tournament.prizePool,
    prizeDistribution: tournament.prizeDistribution,
    rules: tournament.rules,
    format: tournament.format,
    formatDetails: tournament.formatDetails,
    rounds: tournament.rounds,
    pointsConfig: tournament.pointsConfig,
    allowSubstitutes: tournament.allowSubstitutes,
    featured: tournament.featured,
    resultsPublishedAt: tournament.resultsPublishedAt,
    occupancy,
    registrationOpen: window.open,
    registrationReason: window.reason,
    participants: confirmed.map((registration) => ({
      registrationId: registration.id,
      teamId: registration.team.id,
      name: registration.team.name,
      tag: registration.team.tag,
      logoUrl: registration.team.logoUrl,
      roster: registration.team.members,
    })),
    results: resultsPublished
      ? tournament.results.map((result) => ({
          position: result.position,
          points: result.points,
          kills: result.kills,
          prize: result.prize,
          mvpName: result.mvpName,
          team: result.team,
        }))
      : [],
    invitedTeamIds: tournament.invites.map((invite) => invite.teamId),
  };
}

export async function getRoomForViewer(
  tournamentId: string,
  viewer: { id: string; role: string },
) {
  if (viewer.role === "ADMIN") {
    return db.room.findUnique({ where: { tournamentId } });
  }

  const registration = await db.registration.findFirst({
    where: {
      tournamentId,
      captainId: viewer.id,
      status: "CONFIRMED",
    },
    include: { tournament: { include: { room: true } } },
  });

  if (!registration) return null;
  const room = registration.tournament.room;
  if (!room || !room.published) return null;
  return room;
}

export async function getLatestResults(limit = 3) {
  const tournaments = await db.tournament.findMany({
    where: { resultsPublishedAt: { not: null }, access: "PUBLIC" },
    orderBy: { resultsPublishedAt: "desc" },
    take: limit,
    include: {
      results: {
        orderBy: { position: "asc" },
        take: 3,
        include: {
          team: { select: { id: true, name: true, tag: true, logoUrl: true } },
        },
      },
    },
  });
  return tournaments;
}

export async function getPublishedResults(limit = 30) {
  return db.tournament.findMany({
    where: { resultsPublishedAt: { not: null }, access: "PUBLIC" },
    orderBy: { resultsPublishedAt: "desc" },
    take: limit,
    include: {
      results: {
        orderBy: { position: "asc" },
        include: {
          team: { select: { id: true, name: true, tag: true, logoUrl: true } },
        },
      },
      registrations: {
        where: { status: "CONFIRMED" },
        select: { id: true },
      },
    },
  });
}

export async function getPublicTeam(id: string) {
  const team = await db.team.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      tag: true,
      logoUrl: true,
      modality: true,
      suspended: true,
      createdAt: true,
      captain: { select: { name: true } },
      members: {
        select: { id: true, gameName: true, role: true },
        orderBy: { joinedAt: "asc" },
      },
      results: {
        where: { tournament: { resultsPublishedAt: { not: null } } },
        include: {
          tournament: {
            select: { id: true, name: true, slug: true, startsAt: true },
          },
        },
        orderBy: { position: "asc" },
      },
      registrations: {
        where: { status: "CONFIRMED" },
        select: {
          tournament: {
            select: { id: true, name: true, slug: true, startsAt: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  return team;
}

export async function getOrganizationStats() {
  const now = new Date();
  const [finishedTournaments, playerCount, confirmedRegs, prizeSum, upcomingCount] =
    await Promise.all([
      db.tournament.count({ where: { resultsPublishedAt: { not: null } } }),
      db.user.count({
        where: { suspended: false, role: { in: ["PLAYER", "CAPTAIN"] } },
      }),
      db.registration.findMany({
        where: { status: "CONFIRMED" },
        select: { teamId: true },
        distinct: ["teamId"],
      }),
      db.tournamentResult.aggregate({
        where: { tournament: { resultsPublishedAt: { not: null } } },
        _sum: { prize: true },
      }),
      db.tournament.count({
        where: {
          access: "PUBLIC",
          status: { in: ["UPCOMING", "REGISTRATION_OPEN", "FULL"] },
          startsAt: { gte: now },
        },
      }),
    ]);

  return {
    finishedTournaments,
    teamsParticipating: confirmedRegs.length,
    prizesDelivered: prizeSum._sum.prize ?? 0,
    playersRegistered: playerCount,
    upcomingTournaments: upcomingCount,
  };
}

export async function getLandingData() {
  const now = new Date();
  const [upcoming, latestResults, stats, ranking, announcement, settings] =
    await Promise.all([
      getUpcomingTournaments(4),
      getLatestResults(3),
      getOrganizationStats(),
      getRanking(5),
      db.announcement.findFirst({
        where: { active: true },
        orderBy: { createdAt: "desc" },
      }),
      getSettings(),
    ]);

  const featured =
    upcoming.find((tournament) => tournament.featured) ?? upcoming[0] ?? null;

  const champions = latestResults
    .map((tournament) => {
      const champion = tournament.results.find((result) => result.position === 1);
      if (!champion) return null;
      return {
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        slug: tournament.slug,
        date: tournament.resultsPublishedAt ?? tournament.startsAt,
        team: champion.team,
        prize: champion.prize,
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  return {
    now,
    upcoming,
    featured,
    latestResults,
    stats,
    ranking,
    champions,
    announcement,
    settings,
  };
}

export type HomeTeamOverview = {
  id: string | null;
  name: string | null;
  tag: string | null;
  logoUrl: string | null;
  modality: Modality | null;
  totalTeams: number;
  tournamentsPlayed: number;
  tournamentsWon: number;
};

/**
 * Resumen liviano del equipo principal del usuario para la portada móvil.
 * Cuenta solo inscripciones confirmadas y resultados ya publicados.
 */
export async function getHomeTeamOverview(
  userId: string,
): Promise<HomeTeamOverview> {
  const teams = await db.team.findMany({
    where: {
      OR: [{ captainId: userId }, { members: { some: { userId } } }],
    },
    select: {
      id: true,
      name: true,
      tag: true,
      logoUrl: true,
      modality: true,
      registrations: {
        where: { status: "CONFIRMED" },
        select: { id: true },
      },
      results: {
        where: { tournament: { resultsPublishedAt: { not: null } } },
        select: { position: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const primary =
    [...teams].sort(
      (a, b) => b.registrations.length - a.registrations.length,
    )[0] ?? null;

  return {
    id: primary?.id ?? null,
    name: primary?.name ?? null,
    tag: primary?.tag ?? null,
    logoUrl: primary?.logoUrl ?? null,
    modality: primary ? (primary.modality as Modality) : null,
    totalTeams: teams.length,
    tournamentsPlayed: primary?.registrations.length ?? 0,
    tournamentsWon:
      primary?.results.filter((result) => result.position === 1).length ?? 0,
  };
}

export const DEFAULT_SETTINGS = {
  contact_email: "",
  contact_whatsapp: "",
  instagram_url: "",
  youtube_url: "",
  twitch_url: "",
  discord_url: "",
  support_hours: "",
  contact_note: "",
  organization_text: "",
};

export type SiteSettings = typeof DEFAULT_SETTINGS;

export async function getSettings(): Promise<SiteSettings> {
  const rows = await db.setting.findMany();
  const result: SiteSettings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row.key in result) {
      result[row.key as keyof SiteSettings] = row.value;
    }
  }
  return result;
}

export async function getActiveAnnouncements() {
  return db.announcement.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
    take: 3,
  });
}
