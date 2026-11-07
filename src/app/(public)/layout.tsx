import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { FireParticles } from "@/components/fire-particles";
import { getSettings } from "@/lib/queries/public";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getSettings();

  return (
    <>
      <FireParticles fixed count={72} className="site-particles" />
      <div className="relative z-10 flex min-h-screen flex-col">
        <SiteHeader />
        <main id="contenido" className="site-main flex-1">
          {children}
        </main>
        <SiteFooter settings={settings} />
      </div>
    </>
  );
}
