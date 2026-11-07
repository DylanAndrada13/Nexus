import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Ingresá tu email.")
  .email("Ingresá un email válido.");

export const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres.")
  .max(100, "La contraseña es demasiado larga.")
  .regex(/[A-Za-z]/, "La contraseña debe incluir una letra.")
  .regex(/[0-9]/, "La contraseña debe incluir un número.");

export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Ingresá tu nombre.")
      .max(60, "El nombre es demasiado largo."),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Repetí la contraseña."),
    next: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Ingresá tu contraseña."),
  next: z.string().optional(),
});

export const forgotSchema = z.object({
  email: emailSchema,
});

export const resetSchema = z
  .object({
    token: z.string().min(20, "El enlace no es válido."),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Repetí la contraseña."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

export function firstFieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !result[key]) {
      result[key] = issue.message;
    }
  }
  return result;
}

export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isUploadedImage(value: string | null | undefined): boolean {
  if (!value) return false;
  const isUpload =
    value.startsWith("/uploads/") || value.startsWith("/api/uploads/");
  return isUpload && !value.includes("..");
}
