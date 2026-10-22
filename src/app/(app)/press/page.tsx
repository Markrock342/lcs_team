import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Gauge,
  Globe2,
  Newspaper,
  Rocket,
  UsersRound,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/mobile-ui";
import { MARKETIMES_LCS_ARTICLE } from "@/lib/press";

export const metadata: Metadata = {
  title: "ข่าวและสื่อ | Limit Code Studio",
  description: "สรุปบทความจาก Marketimes Asia ที่พูดถึง Limit Code Studio",
};

const sectionIcons = [UsersRound, Rocket, Gauge, Globe2];

export default function PressPage() {
  const article = MARKETIMES_LCS_ARTICLE;

  return (
    <PageShell width="wide">
      <Link
        href="/dashboard"
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      >
        <ArrowLeft size={16} aria-hidden="true" /> กลับไปภาพรวม
      </Link>

      <PageHeader
        kicker="บริษัท · ข่าวและสื่อ"
        title="สื่อพูดถึง Limit Code Studio"
        description="รวมเรื่องราวและมุมมองจากสื่อภายนอก พร้อมลิงก์กลับไปยังแหล่งข่าวต้นฉบับ"
      />

      <article className="ticket-card overflow-hidden">
        <header className="grid gap-0 lg:grid-cols-[minmax(18rem,0.68fr)_minmax(0,1.32fr)]">
          <div className="flex min-h-64 flex-col justify-between bg-surface-raised p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-on-accent">
                <Newspaper size={28} aria-hidden="true" />
              </div>
              <span className="status-stamp status-blue">{article.sourceCategory}</span>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Press file 01</p>
              <p className="mt-2 text-2xl font-semibold">{article.source}</p>
              <p className="mt-1 text-sm leading-6 text-muted">
                โดย {article.author}<br />
                เผยแพร่ {article.publishedAt}
              </p>
            </div>
          </div>

          <div className="p-6 sm:p-8 lg:p-10">
            <p className="text-sm font-semibold text-accent">บทความแนะนำ</p>
            <h1 className="mt-3 max-w-4xl text-2xl font-semibold leading-snug sm:text-3xl">
              {article.title}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-muted sm:text-lg">
              {article.dek}
            </p>
            <a
              href={article.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              อ่านบทความต้นฉบับ <ExternalLink size={16} aria-hidden="true" />
            </a>
          </div>
        </header>

        <section className="border-y border-border bg-surface-soft px-5 py-5 sm:px-8" aria-label="ตัวเลขสำคัญ">
          <div className="grid gap-4 sm:grid-cols-3">
            {article.highlights.map((item) => (
              <div key={item.label} className="flex items-baseline gap-3 sm:block">
                <p className="text-2xl font-semibold tabular-nums text-foreground">{item.value}</p>
                <p className="mt-1 text-sm text-muted">{item.label}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="divide-y divide-border">
            {article.sections.map((section, index) => {
              const Icon = sectionIcons[index];
              return (
                <section key={section.title} className="p-6 sm:p-8">
                  <div className="flex gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-soft text-accent">
                      <Icon size={20} aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                        0{index + 1}
                      </p>
                      <h2 className="mt-1 text-lg font-semibold sm:text-xl">{section.title}</h2>
                      <p className="mt-3 max-w-[70ch] text-base leading-8 text-muted">{section.body}</p>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>

          <aside className="border-t border-border bg-surface-soft p-6 lg:border-l lg:border-t-0" aria-label="เครดิตแหล่งข่าว">
            <div className="lg:sticky lg:top-24">
              <p className="text-sm font-semibold">เกี่ยวกับเนื้อหานี้</p>
              <p className="mt-2 text-sm leading-7 text-muted">
                หน้านี้เป็นบทสรุปที่ Limit Code Studio เรียบเรียงจากบทความของ Marketimes Asia เนื้อหาฉบับเต็ม รูปภาพ และบทสัมภาษณ์เป็นของสำนักข่าวต้นฉบับ
              </p>
              <a
                href={article.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
              >
                เปิด Marketimes Asia <ExternalLink size={15} aria-hidden="true" />
              </a>
            </div>
          </aside>
        </div>
      </article>
    </PageShell>
  );
}

