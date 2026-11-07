"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/dal";
import { actionError, actionSuccess, type ActionState } from "@/lib/action-state";
import { notifyUser } from "@/lib/notifications";
import { firstFieldErrors } from "@/lib/validation";
import {
  MAX_SUBSTITUTES,
  MODALITIES,
  MODALITY_SIZE,
  type Modality,
} from "@/lib/constants";

const teamSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "El nombre debe tener al menos 3 caracteres.")
    .max(30, "El nombre no puede superar los 30 caracteres."),
  tag: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,5}$/, "La etiqueta debe tener entre 2 y 5 letras o números."),
  modality: z.enum(MODALITIES),
  logoUrl: z.string().optional(),
});

const memberSchema = z.object({
  gameName: z
    .string()
    .trim()
    .min(2, "Ingresá el nombre dentro del juego.")
    .max(24, "El nombre es demasiado largo."),
  uid: z
    .string()
    .trim()
    .regex(/^\d{6,20}$/, "El UID debe contener entre 6 y 20 dígitos."),
  role: z.enum(["TITULAR", "SUPLENTE"]),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Ingresá un email válido o dejalo vacío.")
    .optional()
    .or(z.literal("")),
});

function safeLogo(value: string | undefined): string | null {
  if (!value) return null;
  const isUpload =
    value.startsWith("/uploads/") || value.startsWith("/api/uploads/");
  if (isUpload && !value.includes("..")) return value;
  return null;
}

function revalidateTeamViews(teamId?: string) {
  revalidatePath("/panel");
  revalidatePath("/panel/equipos");
  if (teamId) revalidatePath(`/panel/equipos/${teamId}`);
  revalidatePath("/admin/equipos");
  revalidatePath("/torneos");
  revalidatePath("/ranking");
  revalidatePath("/");
}

export async function createTeamAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionError("Tenés que iniciar sesión para crear un equipo.");

  const parsed = teamSchema.safeParse(Object.fromEntries(formData));
  const gameName = String(formData.get("gameName") ?? "").trim();
  const uid = String(formData.get("uid") ?? "").trim();

  if (!parsed.success) {
    return actionError("Revisá los datos del equipo.", firstFieldErrors(parsed.error));
  }
  if (gameName.length < 2 || gameName.length > 24) {
    return actionError("Revisá el nombre dentro del juego.", {
      gameName: "Debe tener entre 2 y 24 caracteres.",
    });
  }
  if (!/^\d{6,20}$/.test(uid)) {
    return actionError("Revisá el UID del capitán.", {
      uid: "El UID debe contener entre 6 y 20 dígitos.",
    });
  }

  const [nameTaken, tagTaken, uidTaken] = await Promise.all([
    db.team.findUnique({ where: { name: parsed.data.name } }),
    db.team.findUnique({ where: { tag: parsed.data.tag } }),
    db.teamMember.findUnique({ where: { uid } }),
  ]);

  if (nameTaken) {
    return actionError("Ya existe un equipo con ese nombre.", {
      name: "Elegí otro nombre.",
    });
  }
  if (tagTaken) {
    return actionError("Ya existe un equipo con esa etiqueta.", {
      tag: "Elegí otra etiqueta.",
    });
  }
  if (uidTaken) {
    return actionError("Ese UID ya está registrado en la plataforma.", {
      uid: "Verificá el UID o contactá a soporte.",
    });
  }

  let teamId = "";
  try {
    const team = await db.$transaction(async (tx) => {
      const created = await tx.team.create({
        data: {
          name: parsed.data.name,
          tag: parsed.data.tag,
          modality: parsed.data.modality,
          logoUrl: safeLogo(parsed.data.logoUrl),
          captainId: user.id,
          members: {
            create: {
              userId: user.id,
              gameName,
              uid,
              role: "TITULAR",
            },
          },
        },
      });

      if (user.role === "PLAYER") {
        await tx.user.update({
          where: { id: user.id },
          data: { role: "CAPTAIN" },
        });
      }

      return created;
    });
    teamId = team.id;
  } catch (error) {
    console.error("Error al crear equipo:", error);
    return actionError(
      "No se pudo crear el equipo. Verificá que el nombre, la etiqueta y el UID no estén en uso.",
    );
  }

  revalidateTeamViews(teamId);
  redirect(`/panel/equipos/${teamId}?creado=1`);
}

export async function updateTeamAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionError("Tu sesión venció. Volvé a iniciar sesión.");

  const teamId = String(formData.get("teamId") ?? "");
  const team = await db.team.findUnique({ where: { id: teamId } });
  if (!team) return actionError("El equipo no existe.");
  if (team.captainId !== user.id && user.role !== "ADMIN") {
    return actionError("No tenés permiso para editar este equipo.");
  }

  const parsed = teamSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return actionError("Revisá los datos del equipo.", firstFieldErrors(parsed.error));
  }

  const [nameTaken, tagTaken] = await Promise.all([
    db.team.findFirst({
      where: { name: parsed.data.name, id: { not: teamId } },
    }),
    db.team.findFirst({
      where: { tag: parsed.data.tag, id: { not: teamId } },
    }),
  ]);
  if (nameTaken) {
    return actionError("Ya existe otro equipo con ese nombre.", {
      name: "Elegí otro nombre.",
    });
  }
  if (tagTaken) {
    return actionError("Ya existe otro equipo con esa etiqueta.", {
      tag: "Elegí otra etiqueta.",
    });
  }

  await db.team.update({
    where: { id: teamId },
    data: {
      name: parsed.data.name,
      tag: parsed.data.tag,
      modality: parsed.data.modality,
      logoUrl: safeLogo(parsed.data.logoUrl),
    },
  });

  revalidateTeamViews(teamId);
  return actionSuccess("Equipo actualizado.");
}

async function assertRosterEditable(teamId: string) {
  const activeRegistration = await db.registration.findFirst({
    where: {
      teamId,
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    select: { id: true },
  });
  return !activeRegistration;
}

export async function addTeamMemberAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionError("Tu sesión venció.");

  const teamId = String(formData.get("teamId") ?? "");
  const team = await db.team.findUnique({
    where: { id: teamId },
    include: { members: true },
  });
  if (!team) return actionError("El equipo no existe.");
  if (team.captainId !== user.id && user.role !== "ADMIN") {
    return actionError("No tenés permiso para editar esta plantilla.");
  }
  if (!(await assertRosterEditable(teamId))) {
    return actionError(
      "El equipo tiene una inscripción activa. Cancelala antes de modificar la plantilla.",
    );
  }

  const parsed = memberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return actionError("Revisá los datos del jugador.", firstFieldErrors(parsed.error));
  }

  const required = MODALITY_SIZE[team.modality as Modality];
  const titulares = team.members.filter((member) => member.role === "TITULAR").length;
  const suplentes = team.members.filter((member) => member.role === "SUPLENTE").length;

  if (parsed.data.role === "TITULAR" && titulares >= required) {
    return actionError(
      `Este equipo es de modalidad con ${required} titulares. Agregalo como suplente o editá la plantilla.`,
    );
  }
  if (parsed.data.role === "SUPLENTE" && suplentes >= MAX_SUBSTITUTES) {
    return actionError(`El equipo ya tiene ${MAX_SUBSTITUTES} suplentes.`);
  }

  const uidTaken = await db.teamMember.findUnique({
    where: { uid: parsed.data.uid },
  });
  if (uidTaken) {
    return actionError("Ese UID ya está registrado en la plataforma.", {
      uid: "Verificá el UID.",
    });
  }

  let linkedUser: { id: string; name: string } | null = null;
  if (parsed.data.email) {
    linkedUser = await db.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, name: true },
    });
    if (!linkedUser) {
      return actionError(
        "No existe una cuenta con ese email. Dejá el campo vacío para registrar al jugador sin vincular una cuenta.",
        { email: "El jugador debe registrarse primero si querés vincular su cuenta." },
      );
    }
    if (linkedUser.id === team.captainId) {
      return actionError("El capitán ya forma parte del equipo.");
    }
    const alreadyInTeam = team.members.some(
      (member) => member.userId === linkedUser?.id,
    );
    if (alreadyInTeam) {
      return actionError("Ese jugador ya forma parte del equipo.");
    }
  }

  await db.teamMember.create({
    data: {
      teamId,
      userId: linkedUser?.id ?? null,
      gameName: parsed.data.gameName,
      uid: parsed.data.uid,
      role: parsed.data.role,
    },
  });

  if (linkedUser) {
    await notifyUser({
      userId: linkedUser.id,
      type: "GENERAL",
      title: "Te agregaron a un equipo",
      body: `Formás parte de ${team.name} (${team.tag}) como ${parsed.data.role === "TITULAR" ? "titular" : "suplente"}.`,
      link: `/panel/equipos/${team.id}`,
    });
  }

  revalidateTeamViews(teamId);
  return actionSuccess("Jugador agregado a la plantilla.");
}

export async function updateTeamMemberAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionError("Tu sesión venció.");

  const memberId = String(formData.get("memberId") ?? "");
  const member = await db.teamMember.findUnique({
    where: { id: memberId },
    include: { team: { include: { members: true } } },
  });
  if (!member) return actionError("El jugador no existe.");
  if (member.team.captainId !== user.id && user.role !== "ADMIN") {
    return actionError("No tenés permiso para editar esta plantilla.");
  }
  if (!(await assertRosterEditable(member.teamId))) {
    return actionError(
      "El equipo tiene una inscripción activa. Cancelala antes de modificar la plantilla.",
    );
  }

  const parsed = memberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return actionError("Revisá los datos del jugador.", firstFieldErrors(parsed.error));
  }

  if (member.userId === member.team.captainId && parsed.data.role !== "TITULAR") {
    return actionError("El capitán debe figurar como titular.");
  }

  const required = MODALITY_SIZE[member.team.modality as Modality];
  const otherTitulares = member.team.members.filter(
    (item) => item.id !== member.id && item.role === "TITULAR",
  ).length;
  if (parsed.data.role === "TITULAR" && otherTitulares >= required) {
    return actionError(`El equipo ya tiene ${required} titulares.`);
  }

  const uidTaken = await db.teamMember.findFirst({
    where: { uid: parsed.data.uid, id: { not: memberId } },
  });
  if (uidTaken) {
    return actionError("Ese UID ya está registrado en la plataforma.", {
      uid: "Verificá el UID.",
    });
  }

  let linkedUserId: string | null = member.userId;
  if (parsed.data.email && parsed.data.email !== "") {
    const linkedUser = await db.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });
    if (!linkedUser) {
      return actionError("No existe una cuenta con ese email.", {
        email: "Dejá el campo vacío para no vincular una cuenta.",
      });
    }
    linkedUserId = linkedUser.id;
  } else if (parsed.data.email === "") {
    linkedUserId = null;
  }

  await db.teamMember.update({
    where: { id: memberId },
    data: {
      gameName: parsed.data.gameName,
      uid: parsed.data.uid,
      role: parsed.data.role,
      userId: linkedUserId,
    },
  });

  revalidateTeamViews(member.teamId);
  return actionSuccess("Jugador actualizado.");
}

export async function removeTeamMemberAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionError("Tu sesión venció.");

  const memberId = String(formData.get("memberId") ?? "");
  const member = await db.teamMember.findUnique({
    where: { id: memberId },
    include: { team: true },
  });
  if (!member) return actionError("El jugador no existe.");
  if (member.team.captainId !== user.id && user.role !== "ADMIN") {
    return actionError("No tenés permiso para editar esta plantilla.");
  }
  if (member.userId === member.team.captainId) {
    return actionError("No podés quitar al capitán del equipo.");
  }
  if (!(await assertRosterEditable(member.teamId))) {
    return actionError(
      "El equipo tiene una inscripción activa. Cancelala antes de modificar la plantilla.",
    );
  }

  await db.teamMember.delete({ where: { id: memberId } });
  revalidateTeamViews(member.teamId);
  return actionSuccess("Jugador eliminado de la plantilla.");
}

export async function deleteTeamAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return actionError("Tu sesión venció.");

  const teamId = String(formData.get("teamId") ?? "");
  const team = await db.team.findUnique({
    where: { id: teamId },
    include: { _count: { select: { registrations: true, results: true } } },
  });
  if (!team) return actionError("El equipo no existe.");
  if (team.captainId !== user.id && user.role !== "ADMIN") {
    return actionError("No tenés permiso para eliminar este equipo.");
  }
  if (team._count.registrations > 0 || team._count.results > 0) {
    return actionError(
      "El equipo ya tiene historial de inscripciones o resultados. No se puede eliminar; podés suspenderlo o dejarlo inactivo.",
    );
  }

  await db.team.delete({ where: { id: teamId } });
  revalidateTeamViews();
  redirect("/panel/equipos?eliminado=1");
}
