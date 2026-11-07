import type { Metadata, Viewport } from "next";
import { Anton, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anton",
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-plex",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
});

function resolveMetadataBase() {
  const raw =
    process.env.APP_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");
  try {
    return new URL(raw);
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: {
    default: "NEXUS FF · Torneos de Free Fire en Argentina",
    template: "%s · NEXUS FF",
  },
  description:
    "Plataforma de torneos de Free Fire en Argentina. Inscribí tu equipo, pagá online y competí por premios reales.",
  applicationName: "NEXUS FF",
  keywords: [
    "Free Fire",
    "torneos",
    "esports",
    "Argentina",
    "NEXUS FF",
    "competencia",
  ],
  openGraph: {
    title: "NEXUS FF · Torneos de Free Fire en Argentina",
    description:
      "Inscribí tu equipo, pagá online y competí por premios reales.",
    locale: "es_AR",
    type: "website",
    siteName: "NEXUS FF",
    images: [
      {
        url: "/assets/og-default.jpg",
        width: 1200,
        height: 630,
        alt: "NEXUS FF · Torneos de Free Fire en Argentina",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NEXUS FF · Torneos de Free Fire en Argentina",
    description: "Inscribí tu equipo, pagá online y competí por premios reales.",
    images: ["/assets/og-default.jpg"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es-AR"
      className={`${anton.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <body>
        <a className="skip-link" href="#contenido">
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
