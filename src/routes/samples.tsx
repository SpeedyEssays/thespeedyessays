import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Download, FileText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { PageShell } from '@/components/site/page-shell'
import { samples } from '@/lib/fixtures'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/samples')({
  head: () => ({
    meta: [
      { title: 'Sample papers — SpeedyEssays' },
      { name: 'description', content: 'Download free sample papers in Nursing, Business, History, Psychology and more, written by SpeedyEssays writers.' },
    ],
  }),
  component: SamplesPage,
})

const subjects = ['All', ...Array.from(new Set(samples.map((s) => s.subject)))]

function SamplesPage() {
  const [subject, setSubject] = useState('All')
  const visible = subject === 'All' ? samples : samples.filter((s) => s.subject === subject)

  return (
    <PageShell>
      <section className="paper-grain border-b">
        <div className="mx-auto max-w-content px-4 py-14 sm:px-6">
          <p className="text-sm font-semibold tracking-wide text-primary/70 uppercase">Sample library</p>
          <h1 className="mt-2 max-w-3xl text-4xl font-semibold sm:text-5xl">Real work from our writing team</h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            Browse and download sample papers across subjects and academic levels. Each one is published with the client’s permission
            and shows the structure, research depth and referencing you can expect.
          </p>
          <div className="mt-8 flex flex-wrap gap-2" role="group" aria-label="Filter by subject">
            {subjects.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={subject === s}
                onClick={() => setSubject(s)}
                className={cn(
                  'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none',
                  subject === s ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-secondary',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-content px-4 py-12 sm:px-6">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => (
            <article key={s.id} id={s.id} className="flex scroll-mt-24 flex-col rounded-xl border bg-card p-6">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold">{s.subject}</span>
                <FileText className="size-5 text-muted-foreground" />
              </div>
              <h2 className="mt-4 text-xl leading-snug font-semibold">{s.title}</h2>
              <p className="mt-3 flex-1 text-sm text-muted-foreground">{s.excerpt}</p>
              <dl className="mt-5 grid grid-cols-4 gap-2 border-t pt-4 text-xs">
                {[
                  ['Type', s.type],
                  ['Level', s.level],
                  ['Style', s.style],
                  ['Pages', String(s.pages)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              <Button variant="outline" className="mt-5" asChild>
                <a href={`/sample-papers/${s.id}.pdf`} download>
                  <Download /> Download PDF
                </a>
              </Button>
            </article>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center gap-4 rounded-2xl bg-primary px-6 py-10 text-center text-primary-foreground">
          <h2 className="text-3xl font-semibold">Want a paper like this, written for your brief?</h2>
          <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90" asChild>
            <Link to="/order">Get a free quote</Link>
          </Button>
        </div>
      </section>
    </PageShell>
  )
}
