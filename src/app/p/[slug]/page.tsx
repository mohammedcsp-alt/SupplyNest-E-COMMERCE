import { notFound } from 'next/navigation';
import { currentLocale, localized } from '@/lib/i18n';
import { db } from '@/lib/db';
import { Card, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** Published CMS content. Text only: React escapes every value, nothing is injected as HTML. */
export default async function CmsPageView({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locale = await currentLocale();
  const page = await db.cmsPage.findFirst({ where: { slug: slug.slice(0, 120), publishedAt: { not: null } } });
  if (!page) notFound();

  const title = localized(locale, page.titleAr, page.titleEn);
  const body = localized(locale, page.bodyAr, page.bodyEn);
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <section className="stack">
      <PageHeader title={title} />
      <Card>
        {paragraphs.length === 0 ? (
          <p className="muted">{localized(locale, 'لا يوجد محتوى.', 'No content.')}</p>
        ) : (
          paragraphs.map((p, idx) => (
            <p key={idx} style={{ whiteSpace: 'pre-line' }}>
              {p}
            </p>
          ))
        )}
      </Card>
    </section>
  );
}
