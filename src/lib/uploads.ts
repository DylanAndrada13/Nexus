import path from "node:path";

/**
 * Directorio donde se persisten los archivos subidos por los usuarios.
 *
 * Se ubica en la RAÍZ del proyecto (fuera de `public/`) para que:
 *  - Next.js no intente servirlos como archivos estáticos (lo cual causaría
 *    404 en producción para archivos añadidos después del build).
 *  - La Route Handler `/api/uploads/[filename]` los sirva dinámicamente
 *    con los headers correctos.
 *
 * En producción arrancar el servidor desde cualquier directorio sigue
 * funcionando porque usamos `process.cwd()`, que Node.js resuelve
 * correctamente al directorio de trabajo del proceso.
 */
export const UPLOADS_DIR = path.join(process.cwd(), "uploads");
