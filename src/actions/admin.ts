"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/dal";
import { actionError, actionSuccess, type ActionState } from "@/lib/action-state";
import { logAudit } from "@/lib/audit";
import {
  TOURNAMENT_ACCESS,
  TOURNAMENT_FORMATS,
  TOURNAMENT_STATUSES,
  MODALITIES,
} from "@/lib/constants";
import { getClientIp } from "@/lib/rate-limit";
import { formatCurrency, parseArgentinaDateTime } from "@/lib/format";
import { randomCode, slugify } from "@/lib/slug";
import { validateTeamForTournament } from "@/lib/team-eligibility";
import {
  computeResultPoints,
  occupancyFrom,
  parsePointsConfig,
  sumPrizes,
} from "@/lib/tournaments";
import {
  notifyTournamentCaptains,
  notifyUser,
  notifyUsers,
} from "@/lib/notifications";

type AdminUser = { id: string; name: string };

async function getAdmin(): Promise<AdminUser | null> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return null;
  return { id: user.id, name: user.name };
}

function numberField(formData: FormData, key: string, fallback = 0): number {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return fallback;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function safeImage(value: FormDataEntryValue | null): string | null {
  const stringValue = String(value ?? "").trim();
  if (!stringValue) return null;
  const isUpload =
    stringValue.startsWith("/uploads/") ||
    stringValue.startsWith("/api/uploads/");
  if (isUpload && !stringValue.includes("..")) {
    return stringValue;
  }
  return null;
}

function revalidateAdminViews(tournamentSlug?: string) {
  revalidatePath("/", "layout");
  revalidatePath("/torneos");
  revalidatePath("/resultados");
  revalidatePath("/ranking");
  if (tournamentSlug) revalidatePath(`/torneos/${tournamentSlug}`);
  revalidatePath("/admin", "layout");
  revalidatePath("/panel", "layout");
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const clean = slugify(base) || "torneo";
  let candidate = clean;
  let counter = 2;
  while (true) {
    const existing = await db.tournament.findFirst({
      where: {
        slug: candidate,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${clean}-${counter}`;
    counter += 1;
  }
}

async function uniqueInviteCode(preferred: string, excludeId?: string) {
  let candidate = preferred.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (candidate.length < 4) candidate = randomCode(8);
  let attempts = 0;
  while (attempts < 8) {
    const existing = await db.tournament.findFirst({
      where: {
        inviteCode: candidate,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = randomCode(8);
    attempts += 1;
  }
  return randomCode(10);
}

export async function saveTournamentAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await getAdmin();
  if (!admin) return actionError("No tenés permiso para esta operación.");

  const id = String(formData.get("id") ?? "") || null;
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const modality = String(formData.get("modality") ?? "");
  const access = String(formData.get("access") ?? "");
  const status = String(formData.get("status") ?? "");
  const format = String(formData.get("format") ?? "");
  const startsAtRaw = String(formData.get("startsAt") ?? "");
  const closesAtRaw = String(formData.get("registrationClosesAt") ?? "");
  const rules = String(formData.get("rules") ?? "").trim();
  const formatDetails = String(formData.get("formatDetails") ?? "").trim();
  const bannerUrl = safeImage(formData.get("bannerUrl"));
  const whatsappRaw = String(formData.get("whatsappUrl") ?? "").trim();
  const maxTeams = numberField(formData, "maxTeams");
  const prizePool = numberField(formData, "prizePool");
  const rounds = numberField(formData, "rounds", 1);
  const allowSubstitutes = formData.get("allowSubstitutes") === "on";
  const featured = formData.get("featured") === "on";

  if (name.length < 4 || name.length > 80) {
    return actionError("El nombre debe tener entre 4 y 80 caracteres.", {
      name: "Nombre inválido.",
    });
  }
  if (description.length < 20) {
    return actionError("La descripción debe tener al menos 20 caracteres.", {
      description: "Agregá un poco más de contexto.",
    });
  }
  if (!MODALITIES.includes(modality as (typeof MODALITIES)[number])) {
    return actionError("Elegí una modalidad válida.");
  }
  if (!TOURNAMENT_ACCESS.includes(access as (typeof TOURNAMENT_ACCESS)[number])) {
    return actionError("Elegí un tipo de acceso válido.");
  }
  if (!TOURNAMENT_STATUSES.includes(status as (typeof TOURNAMENT_STATUSES)[number])) {
    return actionError("Elegí un estado válido.");
  }
  if (!TOURNAMENT_FORMATS.includes(format as (typeof TOURNAMENT_FORMATS)[number])) {
    return actionError("Elegí un formato válido.");
  }
  let whatsappUrl: string | null = null;
  if (whatsappRaw) {
    try {
      const parsedUrl = new URL(whatsappRaw);
      if (
        parsedUrl.protocol !== "https:" ||
        parsedUrl.hostname !== "chat.whatsapp.com" ||
        parsedUrl.pathname.length < 2
      ) {
        throw new Error("invalid");
      }
      whatsappUrl = parsedUrl.toString();
    } catch {
      return actionError(
        "Ingresá un enlace de invitación válido de WhatsApp (https://chat.whatsapp.com/...).",
        { whatsappUrl: "Enlace inválido." },
      );
    }
  }
  if (maxTeams < 2 || maxTeams > 256) {
    return actionError("La cantidad de equipos debe estar entre 2 y 256.");
  }
  if (prizePool < 0 || prizePool > 1_000_000_000) {
    return actionError("El premio total no es válido.");
  }
  if (rounds < 1 || rounds > 50) {
    return actionError("La cantidad de rondas debe estar entre 1 y 50.");
  }

  const startsAt = parseArgentinaDateTime(startsAtRaw);
  if (!startsAt) {
    return actionError("Ingresá una fecha y hora válidas para el torneo.");
  }
  const registrationClosesAt = closesAtRaw
    ? parseArgentinaDateTime(closesAtRaw)
    : null;
  if (closesAtRaw && !registrationClosesAt) {
    return actionError("La fecha de cierre de inscripción no es válida.");
  }
  if (registrationClosesAt && registrationClosesAt >= startsAt) {
    return actionError("El cierre de inscripción debe ser anterior al inicio del torneo.");
  }

  const placements = Array.from({ length: 10 }, (_, index) =>
    numberField(formData, `placement_${index + 1}`),
  );
  if (placements.some((value) => value < 0)) {
    return actionError("Los puntos por posición no pueden ser negativos.");
  }
  const killPoints = numberField(formData, "killPoints");
  if (killPoints < 0) {
    return actionError("Los puntos por eliminación no pueden ser negativos.");
  }
  const tiebreaker = String(formData.get("tiebreaker") ?? "POINTS");
  const pointsConfig = {
    killPoints,
    placements,
    tiebreaker:
      tiebreaker === "KILLS" || tiebreaker === "BEST_PLACEMENT"
        ? tiebreaker
        : "POINTS",
    matches: rounds,
  };

  const prizes = Array.from({ length: 5 }, (_, index) => ({
    position: index + 1,
    amount: numberField(formData, `prize_${index + 1}`),
  })).filter((entry) => entry.amount > 0);

  if (prizes.some((entry) => entry.amount < 0)) {
    return actionError("Los premios no pueden ser negativos.");
  }
  if (sumPrizes(prizes) > prizePool) {
    return actionError(
      `La suma de premios (${formatCurrency(sumPrizes(prizes))}) supera el premio total declarado (${formatCurrency(prizePool)}).`,
    );
  }

  let inviteCode: string | null = null;
  if (access === "PRIVATE") {
    inviteCode = await uniqueInviteCode(
      String(formData.get("inviteCode") ?? ""),
      id ?? undefined,
    );
  }

  let tournamentId = id;
  let slug = "";

  try {
    if (id) {
      const current = await db.tournament.findUnique({
        where: { id },
        include: {
          registrations: { select: { status: true } },
          _count: { select: { results: true } },
        },
      });
      if (!current) return actionError("El torneo no existe.");
      slug = current.slug;

      const occupancy = occupancyFrom(current.registrations, current.maxTeams);
      if (maxTeams < occupancy.occupied) {
        return actionError(
          `No podés reducir los cupos a ${maxTeams}: ya hay ${occupancy.occupied} equipos ocupando lugar.`,
        );
      }
      if (
        modality !== current.modality &&
        current.registrations.some((registration) =>
          ["PENDING", "CONFIRMED"].includes(registration.status),
        )
      ) {
        return actionError(
          "No podés cambiar la modalidad con inscripciones activas. Cancelá las inscripciones primero.",
        );
      }

      await db.tournament.update({
        where: { id },
        data: {
          name,
          description,
          bannerUrl,
          modality,
          access,
          status,
          startsAt,
          registrationClosesAt,
          whatsappUrl,
          maxTeams,
          prizePool,
          prizeDistribution: JSON.stringify(prizes),
          rules,
          format,
          formatDetails,
          rounds,
          pointsConfig: JSON.stringify(pointsConfig),
          allowSubstitutes,
          inviteCode,
          featured,
        },
      });

      await logAudit({
        adminId: admin.id,
        action: "UPDATE_TOURNAMENT",
        entity: "Tournament",
        entityId: id,
        details: { name, status, whatsappUrl, maxTeams },
        ip: await getClientIp(),
      });
    } else {
      slug = await uniqueSlug(name);
      const created = await db.tournament.create({
        data: {
          slug,
          name,
          description,
          bannerUrl,
          modality,
          access,
          status,
          startsAt,
          registrationClosesAt,
          whatsappUrl,
          maxTeams,
          prizePool,
          prizeDistribution: JSON.stringify(prizes),
          rules,
          format,
          formatDetails,
          rounds,
          pointsConfig: JSON.stringify(pointsConfig),
          allowSubstitutes,
          inviteCode,
          featured,
        },
      });
      tournamentId = created.id;

      await logAudit({
        adminId: admin.id,
        action: "CREATE_TOURNAMENT",
        entity: "Tournament",
        entityId: created.id,
        details: { name, status, whatsappUrl, maxTeams },
        ip: await getClientIp(),
      });
    }
  } catch (error) {
    console.error("Error al guardar torneo:", error);
    return actionError("No se pudo guardar el torneo. Revisá los datos e intentá de nuevo.");
  }

  revalidateAdminViews(slug);
  redirect(`/admin/torneos/${tournamentId}?guardado=1`);
}

export async function cancelTournamentAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await getAdmin();
  if (!admin) return actionError("No tenés permiso.");

  const tournamentId = String(formData.get("tournamentId") ?? "");
  const tournament = await db.tournament.findUnique({
    where: { id: tournamentId },
    include: { registrations: { where: { status: "CONFIRMED" } } },
  });
  if (!tournament) return actionError("El torneo no existe.");
  if (tournament.status === "CANCELLED") return actionError("El torneo ya está cancelado.");

  await db.tournament.update({
    where: { id: tournamentId },
    data: { status: "CANCELLED" },
  });

  await notifyTournamentCaptains(tournamentId, {
    type: "GENERAL",
    title: "Torneo cancelado",
    body: `${tournament.name} fue cancelado. El equipo administrativo va a contactarte por el grupo de WhatsApp para coordinar los próximos pasos.`,
    link: `/torneos/${tournament.slug}`,
  });

  await logAudit({
    adminId: admin.id,
    action: "CANCEL_TOURNAMENT",
    entity: "Tournament",
    entityId: tournamentId,
    details: { name: tournament.name },
    ip: await getClientIp(),
  });

  revalidateAdminViews(tournament.slug);
  return actionSuccess("Torneo cancelado. Se notificó a los capitanes inscriptos.");
}

export async function deleteTournamentAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await getAdmin();
  if (!admin) return actionError("No tenés permiso.");

  const tournamentId = String(formData.get("tournamentId") ?? "");
  const tournament = await db.tournament.findUnique({
    where: { id: tournamentId },
    include: { _count: { select: { registrations: true, results: true } } },
  });
  if (!tournament) return actionError("El torneo no existe.");
  if (tournament._count.registrations > 0 || tournament._count.results > 0) {
    return actionError(
      "No se puede eliminar un torneo con inscripciones o resultados. Podés cancelarlo.",
    );
  }

  await db.tournament.delete({ where: { id: tournamentId } });
  await logAudit({
    adminId: admin.id,
    action: "DELETE_TOURNAMENT",
    entity: "Tournament",
    entityId: tournamentId,
    details: { name: tournament.name },
    ip: await getClientIp(),
  });

  revalidateAdminViews();
  redirect("/admin/torneos?eliminado=1");
}

export async function saveRoomAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await getAdmin();
  if (!admin) return actionError("No tenés permiso.");

  const tournamentId = String(formData.get("tournamentId") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();
  const opensAtRaw = String(formData.get("opensAt") ?? "");
  const instructions = String(formData.get("instructions") ?? "").trim();
  const published = formData.get("published") === "on";

  if (code.length < 3 || code.length > 60) {
    return actionError("El ID de sala debe tener entre 3 y 60 caracteres.");
  }
  if (password.length < 3 || password.length > 60) {
    return actionError("La contraseña de sala debe tener entre 3 y 60 caracteres.");
  }
  const opensAt = opensAtRaw ? parseArgentinaDateTime(opensAtRaw) : null;
  if (opensAtRaw && !opensAt) {
    return actionError("La fecha de apertura de sala no es válida.");
  }
  if (instructions.length > 1000) {
    return actionError("Las indicaciones no pueden superar los 1000 caracteres.");
  }

  const tournament = await db.tournament.findUnique({
    where: { id: tournamentId },
    include: { room: true },
  });
  if (!tournament) return actionError("El torneo no existe.");

  const wasPublished = tournament.room?.published ?? false;

  await db.room.upsert({
    where: { tournamentId },
    update: { code, password, opensAt, instructions, published },
    create: { tournamentId, code, password, opensAt, instructions, published },
  });

  if (published && !wasPublished) {
    await notifyTournamentCaptains(tournamentId, {
      type: "ROOM_PUBLISHED",
      title: "Sala disponible",
      body: `Ya podés consultar los datos de la sala de ${tournament.name} desde tu panel.`,
      link: "/panel/salas",
    });
  }

  await logAudit({
    adminId: admin.id,
    action: "SAVE_ROOM",
    entity: "Room",
    entityId: tournamentId,
    details: { code, published },
    ip: await getClientIp(),
  });

  revalidateAdminViews(tournament.slug);
  return actionSuccess(
    published
      ? "Sala guardada y publicada para los capitanes confirmados."
      : "Sala guardada. Todavía no está visible para los capitanes.",
  );
}

export async function deleteRoomAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await getAdmin();
  if (!admin) return actionError("No tenés permiso.");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const tournament = await db.tournament.findUnique({
    where: { id: tournamentId },
    select: { slug: true, name: true },
  });
  if (!tournament) return actionError("El torneo no existe.");

  await db.room.deleteMany({ where: { tournamentId } });
  await logAudit({
    adminId: admin.id,
    action: "DELETE_ROOM",
    entity: "Room",
    entityId: tournamentId,
    ip: await getClientIp(),
  });
  revalidateAdminViews(tournament.slug);
  return actionSuccess("Sala eliminada.");
}

export async function createInviteAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await getAdmin();
  if (!admin) return actionError("No tenés permiso.");

  const tournamentId = String(formData.get("tournamentId") ?? "");
  const teamId = String(formData.get("teamId") ?? "");
  const [tournament, team] = await Promise.all([
    db.tournament.findUnique({ where: { id: tournamentId } }),
    db.team.findUnique({ where: { id: teamId } }),
  ]);
  if (!tournament) return actionError("El torneo no existe.");
  if (!team) return actionError("El equipo no existe.");
  if (tournament.access !== "PRIVATE") {
    return actionError("Las invitaciones solo aplican a torneos privados.");
  }
  if (tournament.modality !== team.modality) {
    return actionError("La modalidad del equipo no coincide con la del torneo.");
  }

  await db.tournamentInvite.upsert({
    where: { tournamentId_teamId: { tournamentId, teamId } },
    update: {},
    create: { tournamentId, teamId },
  });

  await notifyUser({
    userId: team.captainId,
    type: "GENERAL",
    title: "Invitación a torneo privado",
    body: `${team.name} fue invitado a ${tournament.name}. Ya podés inscribirlo desde tu panel.`,
    link: `/torneos/${tournament.slug}`,
  });

  await logAudit({
    adminId: admin.id,
    action: "CREATE_INVITE",
    entity: "TournamentInvite",
    entityId: `${tournamentId}:${teamId}`,
    details: { tournament: tournament.name, team: team.name },
    ip: await getClientIp(),
  });

  revalidateAdminViews(tournament.slug);
  return actionSuccess(`Invitación creada para ${team.name}.`);
}

export async function revokeInviteAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await getAdmin();
  if (!admin) return actionError("No tenés permiso.");

  const inviteId = String(formData.get("inviteId") ?? "");
  const invite = await db.tournamentInvite.findUnique({
    where: { id: inviteId },
    include: { tournament: { select: { slug: true, name: true } }, team: { select: { name: true } } },
  });
  if (!invite) return actionError("La invitación no existe.");

  await db.tournamentInvite.delete({ where: { id: inviteId } });
  await logAudit({
    adminId: admin.id,
    action: "REVOKE_INVITE",
    entity: "TournamentInvite",
    entityId: inviteId,
    details: { tournament: invite.tournament.name, team: invite.team.name },
    ip: await getClientIp(),
  });

  revalidateAdminViews(invite.tournament.slug);
  return actionSuccess("Invitación revocada.");
}

export async function saveResultsAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await getAdmin();
  if (!admin) return actionError("No tenés permiso.");

  const tournamentId = String(formData.get("tournamentId") ?? "");
  const tournament = await db.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      registrations: {
        where: { status: "CONFIRMED" },
        include: { team: { select: { id: true, name: true } } },
      },
    },
  });
  if (!tournament) return actionError("El torneo no existe.");
  if (tournament.registrations.length === 0) {
    return actionError("No hay equipos confirmados para cargar resultados.");
  }

  const config = parsePointsConfig(tournament.pointsConfig);
  const entries: {
    teamId: string;
    position: number;
    kills: number;
    prize: number;
    mvpName: string | null;
    points: number;
  }[] = [];
  const positions = new Set<number>();
  let totalPrize = 0;

  for (const registration of tournament.registrations) {
    const teamId = registration.team.id;
    const positionRaw = String(formData.get(`position_${teamId}`) ?? "").trim();
    if (!positionRaw) {
      return actionError(
        `Falta la posición final de ${registration.team.name}.`,
      );
    }
    const position = Number(positionRaw);
    if (!Number.isInteger(position) || position < 1) {
      return actionError(`La posición de ${registration.team.name} no es válida.`);
    }
    if (positions.has(position)) {
      return actionError(
        `La posición ${position} está repetida. Cada equipo debe tener una posición distinta.`,
      );
    }
    positions.add(position);

    const kills = numberField(formData, `kills_${teamId}`);
    const prize = numberField(formData, `prize_${teamId}`);
    if (kills < 0 || kills > 999) {
      return actionError(`Las eliminaciones de ${registration.team.name} no son válidas.`);
    }
    if (prize < 0) {
      return actionError(`El premio de ${registration.team.name} no es válido.`);
    }
    totalPrize += prize;

    entries.push({
      teamId,
      position,
      kills,
      prize,
      mvpName:
        String(formData.get(`mvp_${teamId}`) ?? "").trim().slice(0, 60) || null,
      points: computeResultPoints(position, kills, config),
    });
  }

  const expectedPositions = tournament.registrations.length;
  for (let index = 1; index <= expectedPositions; index += 1) {
    if (!positions.has(index)) {
      return actionError(
        `Faltan posiciones: el acta debe cubrir del 1° al ${expectedPositions}° puesto sin huecos.`,
      );
    }
  }

  if (totalPrize > tournament.prizePool) {
    return actionError(
      `La suma de premios (${formatCurrency(totalPrize)}) supera el premio total del torneo (${formatCurrency(tournament.prizePool)}).`,
    );
  }

  await db.$transaction(async (tx) => {
    await tx.tournamentResult.deleteMany({ where: { tournamentId } });
    await tx.tournamentResult.createMany({
      data: entries.map((entry) => ({
        tournamentId,
        teamId: entry.teamId,
        position: entry.position,
        kills: entry.kills,
        points: entry.points,
        prize: entry.prize,
        mvpName: entry.mvpName,
      })),
    });
  });

  await logAudit({
    adminId: admin.id,
    action: "SAVE_RESULTS",
    entity: "Tournament",
    entityId: tournamentId,
    details: { tournament: tournament.name, entries: entries.length, totalPrize },
    ip: await getClientIp(),
  });

  revalidateAdminViews(tournament.slug);
  return actionSuccess(
    "Acta guardada. Revisá las posiciones y publicá los resultados cuando estén listos.",
  );
}

export async function publishResultsAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await getAdmin();
  if (!admin) return actionError("No tenés permiso.");

  const tournamentId = String(formData.get("tournamentId") ?? "");
  const tournament = await db.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      results: true,
      registrations: {
        where: { status: "CONFIRMED" },
        include: {
          team: { select: { members: { select: { userId: true } } } },
          captain: { select: { id: true } },
        },
      },
    },
  });
  if (!tournament) return actionError("El torneo no existe.");
  if (tournament.results.length === 0) {
    return actionError("Primero cargá y guardá el acta de resultados.");
  }
  if (tournament.results.length !== tournament.registrations.length) {
    return actionError(
      "El acta debe incluir a todos los equipos confirmados antes de publicarse.",
    );
  }

  await db.tournament.update({
    where: { id: tournamentId },
    data: { resultsPublishedAt: new Date(), status: "FINISHED" },
  });

  const userIds = new Set<string>();
  for (const registration of tournament.registrations) {
    userIds.add(registration.captain.id);
    for (const member of registration.team.members) {
      if (member.userId) userIds.add(member.userId);
    }
  }

  await notifyUsers([...userIds], {
    type: "RESULTS_PUBLISHED",
    title: "Resultados publicados",
    body: `El acta final de ${tournament.name} ya está disponible con posiciones, premios y ranking.`,
    link: `/torneos/${tournament.slug}`,
  });

  await logAudit({
    adminId: admin.id,
    action: "PUBLISH_RESULTS",
    entity: "Tournament",
    entityId: tournamentId,
    details: { tournament: tournament.name },
    ip: await getClientIp(),
  });

  revalidateAdminViews(tournament.slug);
  return actionSuccess("Resultados publicados. El ranking se actualizó automáticamente.");
}

export async function unpublishResultsAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await getAdmin();
  if (!admin) return actionError("No tenés permiso.");
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const tournament = await db.tournament.findUnique({
    where: { id: tournamentId },
    select: { slug: true, name: true },
  });
  if (!tournament) return actionError("El torneo no existe.");

  await db.tournament.update({
    where: { id: tournamentId },
    data: { resultsPublishedAt: null },
  });

  await logAudit({
    adminId: admin.id,
    action: "UNPUBLISH_RESULTS",
    entity: "Tournament",
    entityId: tournamentId,
    details: { tournament: tournament.name },
    ip: await getClientIp(),
  });

  revalidateAdminViews(tournament.slug);
  return actionSuccess("Resultados despublicados. Ya no aparecen en el ranking público.");
}

export async function adminCancelRegistrationAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await getAdmin();
  if (!admin) return actionError("No tenés permiso.");

  const registrationId = String(formData.get("registrationId") ?? "");
  const registration = await db.registration.findUnique({
    where: { id: registrationId },
    include: {
      tournament: { select: { name: true, slug: true } },
      team: { select: { name: true } },
      captain: { select: { id: true } },
    },
  });
  if (!registration) return actionError("La inscripción no existe.");
  if (registration.status === "CANCELLED") {
    return actionError("La inscripción ya está cancelada.");
  }

  await db.registration.update({
    where: { id: registrationId },
    data: { status: "CANCELLED", confirmedAt: null },
  });

  await notifyUser({
    userId: registration.captain.id,
    type: "REGISTRATION_CANCELLED",
    title: "Inscripción cancelada",
    body: `El equipo administrativo canceló la inscripción de ${registration.team.name} en ${registration.tournament.name}.`,
    link: "/panel/inscripciones",
  });

  await logAudit({
    adminId: admin.id,
    action: "CANCEL_REGISTRATION",
    entity: "Registration",
    entityId: registrationId,
    details: {
      tournament: registration.tournament.name,
      team: registration.team.name,
    },
    ip: await getClientIp(),
  });

  revalidateAdminViews(registration.tournament.slug);
  return actionSuccess("Inscripción cancelada. Se liberó el cupo.");
}

export async function addTournamentRegistrationAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await getAdmin();
  if (!admin) return actionError("No tenés permiso.");

  const tournamentId = String(formData.get("tournamentId") ?? "");
  const teamId = String(formData.get("teamId") ?? "");
  const [tournament, team] = await Promise.all([
    db.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        registrations: {
          select: {
            id: true,
            teamId: true,
            status: true,
            team: { select: { members: { select: { uid: true } } } },
          },
        },
      },
    }),
    db.team.findUnique({
      where: { id: teamId },
      include: {
        members: { select: { uid: true, role: true, userId: true } },
      },
    }),
  ]);
  if (!tournament) return actionError("El torneo no existe.");
  if (!team) return actionError("El equipo no existe.");

  const existing = tournament.registrations.find(
    (registration) => registration.teamId === teamId,
  );
  const otherUids = new Set(
    tournament.registrations
      .filter(
        (registration) =>
          registration.teamId !== teamId &&
          (registration.status === "PENDING" || registration.status === "CONFIRMED"),
      )
      .flatMap((registration) =>
        registration.team.members.map((member) => member.uid),
      ),
  );
  const validation = validateTeamForTournament(team, tournament, {
    hasRegistration: Boolean(existing && existing.status !== "CANCELLED"),
    otherUidsInTournament: otherUids,
  });
  if (!validation.eligible) {
    return actionError(validation.reason ?? "El equipo no cumple los requisitos.");
  }

  const occupancy = occupancyFrom(tournament.registrations, tournament.maxTeams);
  if (!existing && occupancy.isFull) {
    return actionError("No quedan cupos disponibles en este torneo.");
  }

  if (existing) {
    await db.registration.update({
      where: { id: existing.id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
  } else {
    await db.registration.create({
      data: {
        tournamentId,
        teamId,
        captainId: team.captainId,
        status: "CONFIRMED",
        confirmedAt: new Date(),
      },
    });
  }

  await notifyUser({
    userId: team.captainId,
    type: "REGISTRATION_CONFIRMED",
    title: "Equipo confirmado",
    body: `${team.name} quedó confirmado en ${tournament.name}. Ingresá al grupo de WhatsApp del torneo para coordinar la participación.`,
    link: `/torneos/${tournament.slug}`,
  });

  await logAudit({
    adminId: admin.id,
    action: "ADD_REGISTRATION",
    entity: "Registration",
    entityId: teamId,
    details: { tournament: tournament.name, team: team.name },
    ip: await getClientIp(),
  });

  revalidateAdminViews(tournament.slug);
  return actionSuccess(`${team.name} quedó inscripto en ${tournament.name}.`);
}

export async function adminUpdateTeamAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await getAdmin();
  if (!admin) return actionError("No tenés permiso.");

  const teamId = String(formData.get("teamId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const tag = String(formData.get("tag") ?? "").trim().toUpperCase();
  const suspended = formData.get("suspended") === "on";
  const logoUrl = safeImage(formData.get("logoUrl"));

  if (name.length < 3 || name.length > 30) {
    return actionError("El nombre del equipo debe tener entre 3 y 30 caracteres.");
  }
  if (!/^[A-Z0-9]{2,5}$/.test(tag)) {
    return actionError("La etiqueta debe tener entre 2 y 5 letras o números.");
  }

  const team = await db.team.findUnique({ where: { id: teamId } });
  if (!team) return actionError("El equipo no existe.");

  const [nameTaken, tagTaken] = await Promise.all([
    db.team.findFirst({ where: { name, id: { not: teamId } } }),
    db.team.findFirst({ where: { tag, id: { not: teamId } } }),
  ]);
  if (nameTaken) return actionError("Ya existe otro equipo con ese nombre.");
  if (tagTaken) return actionError("Ya existe otro equipo con esa etiqueta.");

  await db.team.update({
    where: { id: teamId },
    data: { name, tag, suspended, logoUrl },
  });

  await logAudit({
    adminId: admin.id,
    action: "UPDATE_TEAM",
    entity: "Team",
    entityId: teamId,
    details: { name, tag, suspended },
    ip: await getClientIp(),
  });

  revalidateAdminViews();
  return actionSuccess("Equipo actualizado.");
}

export async function updateUserRoleAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await getAdmin();
  if (!admin) return actionError("No tenés permiso.");

  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!["ADMIN", "CAPTAIN", "PLAYER"].includes(role)) {
    return actionError("Rol inválido.");
  }
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return actionError("El usuario no existe.");
  if (user.id === admin.id && role !== "ADMIN") {
    return actionError("No podés quitarte tu propio rol de administrador.");
  }
  if (user.role === "ADMIN" && role !== "ADMIN") {
    const adminCount = await db.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return actionError("Tiene que existir al menos un administrador activo.");
    }
  }

  await db.user.update({ where: { id: userId }, data: { role } });
  await logAudit({
    adminId: admin.id,
    action: "UPDATE_USER_ROLE",
    entity: "User",
    entityId: userId,
    details: { previousRole: user.role, role },
    ip: await getClientIp(),
  });

  revalidateAdminViews();
  return actionSuccess(`Rol actualizado a ${role}.`);
}

export async function toggleUserSuspensionAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await getAdmin();
  if (!admin) return actionError("No tenés permiso.");

  const userId = String(formData.get("userId") ?? "");
  if (userId === admin.id) {
    return actionError("No podés suspender tu propia cuenta.");
  }
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return actionError("El usuario no existe.");

  await db.user.update({
    where: { id: userId },
    data: { suspended: !user.suspended },
  });

  await logAudit({
    adminId: admin.id,
    action: user.suspended ? "UNSUSPEND_USER" : "SUSPEND_USER",
    entity: "User",
    entityId: userId,
    details: { email: user.email },
    ip: await getClientIp(),
  });

  revalidateAdminViews();
  return actionSuccess(
    user.suspended ? "Usuario reactivado." : "Usuario suspendido.",
  );
}

const SETTING_KEYS = [
  "contact_email",
  "contact_whatsapp",
  "instagram_url",
  "youtube_url",
  "twitch_url",
  "discord_url",
  "support_hours",
  "contact_note",
  "organization_text",
] as const;

export async function saveSettingsAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await getAdmin();
  if (!admin) return actionError("No tenés permiso.");

  const values: Record<string, string> = {};
  for (const key of SETTING_KEYS) {
    values[key] = String(formData.get(key) ?? "").trim().slice(0, 2000);
  }

  if (values.contact_email) {
    const email = values.contact_email;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return actionError("El email de contacto no es válido.");
    }
  }
  for (const key of ["instagram_url", "youtube_url", "twitch_url", "discord_url"] as const) {
    if (values[key]) {
      try {
        const url = new URL(values[key]);
        if (!["http:", "https:"].includes(url.protocol)) {
          return actionError(`La URL de ${key.replace("_url", "")} no es válida.`);
        }
      } catch {
        return actionError(`La URL de ${key.replace("_url", "")} no es válida.`);
      }
    }
  }
  if (values.contact_whatsapp && !/^[+\d\s()-]{6,25}$/.test(values.contact_whatsapp)) {
    return actionError("El número de WhatsApp no es válido.");
  }

  await db.$transaction(
    SETTING_KEYS.map((key) =>
      db.setting.upsert({
        where: { key },
        update: { value: values[key] },
        create: { key, value: values[key] },
      }),
    ),
  );

  await logAudit({
    adminId: admin.id,
    action: "UPDATE_SETTINGS",
    entity: "Setting",
    details: Object.keys(values),
    ip: await getClientIp(),
  });

  revalidateAdminViews();
  return actionSuccess("Configuración guardada. Los cambios ya se ven en el sitio.");
}

export async function createAnnouncementAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await getAdmin();
  if (!admin) return actionError("No tenés permiso.");

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (title.length < 3 || title.length > 100) {
    return actionError("El título debe tener entre 3 y 100 caracteres.");
  }
  if (body.length < 10 || body.length > 500) {
    return actionError("El anuncio debe tener entre 10 y 500 caracteres.");
  }

  const announcement = await db.announcement.create({
    data: { title, body, active: true },
  });

  const users = await db.user.findMany({
    where: { suspended: false },
    select: { id: true },
  });
  await notifyUsers(
    users.map((user) => user.id),
    {
      type: "ANNOUNCEMENT",
      title,
      body,
      link: "/panel/notificaciones",
    },
  );

  await logAudit({
    adminId: admin.id,
    action: "CREATE_ANNOUNCEMENT",
    entity: "Announcement",
    entityId: announcement.id,
    details: { title },
    ip: await getClientIp(),
  });

  revalidateAdminViews();
  return actionSuccess("Anuncio publicado y notificado a los usuarios.");
}

export async function toggleAnnouncementAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await getAdmin();
  if (!admin) return actionError("No tenés permiso.");
  const id = String(formData.get("id") ?? "");
  const announcement = await db.announcement.findUnique({ where: { id } });
  if (!announcement) return actionError("El anuncio no existe.");

  await db.announcement.update({
    where: { id },
    data: { active: !announcement.active },
  });

  await logAudit({
    adminId: admin.id,
    action: "TOGGLE_ANNOUNCEMENT",
    entity: "Announcement",
    entityId: id,
    details: { active: !announcement.active },
    ip: await getClientIp(),
  });

  revalidateAdminViews();
  return actionSuccess(
    announcement.active ? "Anuncio desactivado." : "Anuncio activado.",
  );
}

export async function deleteAnnouncementAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await getAdmin();
  if (!admin) return actionError("No tenés permiso.");
  const id = String(formData.get("id") ?? "");
  const announcement = await db.announcement.findUnique({ where: { id } });
  if (!announcement) return actionError("El anuncio no existe.");

  await db.announcement.delete({ where: { id } });
  await logAudit({
    adminId: admin.id,
    action: "DELETE_ANNOUNCEMENT",
    entity: "Announcement",
    entityId: id,
    details: { title: announcement.title },
    ip: await getClientIp(),
  });

  revalidateAdminViews();
  return actionSuccess("Anuncio eliminado.");
}

export async function resolveSupportMessageAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await getAdmin();
  if (!admin) return actionError("No tenés permiso.");
  const id = String(formData.get("id") ?? "");
  const message = await db.supportMessage.findUnique({ where: { id } });
  if (!message) return actionError("El mensaje no existe.");

  await db.supportMessage.update({
    where: { id },
    data: { status: message.status === "OPEN" ? "RESOLVED" : "OPEN" },
  });

  await logAudit({
    adminId: admin.id,
    action: "TOGGLE_SUPPORT_MESSAGE",
    entity: "SupportMessage",
    entityId: id,
    ip: await getClientIp(),
  });

  revalidatePath("/admin/mensajes");
  revalidatePath("/admin");
  return actionSuccess(
    message.status === "OPEN" ? "Mensaje marcado como resuelto." : "Mensaje reabierto.",
  );
}
