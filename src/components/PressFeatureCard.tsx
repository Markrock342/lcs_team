import Link from "next/link";
import { ArrowRight, Newspaper } from "lucide-react";
import { MARKETIMES_LCS_ARTICLE } from "@/lib/press";

export function PressFeatureCard() {
  const article = MARKETIMES_LCS_ARTICLE;

  return (
    <section className="ticket-card overflow-hidden" aria-labelledby="press-feature-title">
      <div className="grid lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
        <div className="flex min-h-52 flex-col justify-between bg-surface-raised p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-on-accent">
              <Newspaper size={24} aria-hidden="true" />
            </div>
            <span className="status-stamp status-blue">ข่าวและสื่อ</span>
          </div>
          <div className="mt-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              Press file 01
            </p>
            <p className="mt-2 text-xl font-semibold">{article.source}</p>
            <p className="mt-1 text-sm text-muted">
              {article.sourceCategory} · {article.publishedAt}
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-between p-5 sm:p-6">
          <div>
            <p className="text-sm font-semibold text-accent">สื่อพูดถึงเรา</p>
            <h2 id="press-feature-title" className="mt-2 max-w-3xl text-xl font-semibold leading-snug sm:text-2xl">
              {article.title}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted sm:text-base">
              {article.dek}
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
              {article.highlights.map((item) => (
                <span key={item.label}>
                  <strong className="font-semibold text-foreground">{item.value}</strong> {item.label}
                </span>
              ))}
            </div>
            <Link
              href="/press"
              className="inline-flex min-h-11 shrink-0 items-center gap-2 font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              อ่านสรุปข่าว <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

