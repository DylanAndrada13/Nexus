import "server-only";
import { z } from "zod";

// Si APP_URL no está definida, Vercel provee VERCEL_URL automáticamente
if (!process.env.APP_URL && process.env.VERCEL_URL) {
  process.env.APP_URL = `https://${process.env.VERCEL_URL}`;
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "Falta DATABASE_URL"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET debe tener al menos 32 caracteres"),
  APP_URL: z
    .string()
    .url("APP_URL debe ser una URL válida")
    .default("http://localhost:3000"),
  RESEND_API_KEY: z.string().optional().default(""),
  EMAIL_FROM: z.string().optional().default("NEXUS FF <no-reply@nexusff.com>"),
  DEV_SHOW_RESET_LINK: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const detail = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Configuración de entorno inválida:\n${detail}`);
}

export const env = {
  ...parsed.data,
  APP_URL: parsed.data.APP_URL.replace(/\/+$/, ""),
  isProduction: process.env.NODE_ENV === "production",
  isDevelopment: process.env.NODE_ENV !== "production",
};

export function showDevResetLink(): boolean {
  return env.isDevelopment && env.DEV_SHOW_RESET_LINK !== "false";
}
