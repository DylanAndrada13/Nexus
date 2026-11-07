import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { UPLOADS_DIR } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  const match = /^[a-f0-9-]{36}\.(png|jpe?g|webp)$/i.exec(filename);

  if (!match) {
    return new NextResponse("No encontrado.", { status: 404 });
  }

  const contentType = CONTENT_TYPES[match[1].toLowerCase()];

  try {
    const file = await readFile(path.join(UPLOADS_DIR, filename));

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(file.length),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("No encontrado.", { status: 404 });
  }
}
