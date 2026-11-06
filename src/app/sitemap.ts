import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.APP_URL;

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${base}/torneos`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/resultados`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/ranking`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/registro`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/login`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.4 },
  ];

  try {
    const tournaments = await db.tournament.findMany({
      where: { status: { not: "CANCELLED" } },
      select: { slug: true, updatedAt: true },
      orderBy: { startsAt: "desc" },
      take: 200,
    });

    const teams = await db.team.findMany({
      where: { suspended: false },
      select: { id: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const tournamentRoutes: MetadataRoute.Sitemap = tournaments.map((t) => ({
      url: `${base}/torneos/${t.slug}`,
      lastModified: t.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.8,
    }));

    const teamRoutes: MetadataRoute.Sitemap = teams.map((t) => ({
      url: `${base}/equipos/${t.id}`,
      lastModified: t.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    }));

    return [...staticRoutes, ...tournamentRoutes, ...teamRoutes];
  } catch {
    // Si la base de datos no está disponible durante el build, devolvemos solo las rutas estáticas
    return staticRoutes;
  }
}
