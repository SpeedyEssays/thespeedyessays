import { createFileRoute, Link, notFound } from '@tanstack/react-router'

import { PageShell } from '@/components/site/page-shell'
import { policies } from '@/lib/policies'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/policies/$slug')({
  loader: ({ params }) => {
    const policy = policies.find((p) => p.slug === params.slug)
    if (!policy) throw notFound()
    return policy
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [{ title: `${loaderData.title} — SpeedyEssays` }, { name: 'description', content: loaderData.summary }]
      : [],
  }),
  component: PolicyPage,
})

function PolicyPage() {
  const policy = Route.useLoaderData()

  return (
    <PageShell>
      <div className="mx-auto grid max-w-content gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Policies" className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Policies</p>
          <ul className="space-y-1 text-sm">
            {policies.map((p) => (
              <li key={p.slug}>
                <Link
                  to="/policies/$slug"
                  params={{ slug: p.slug }}
                  className={cn(
                    'block rounded-md px-3 py-2 hover:bg-secondary',
                    p.slug === policy.slug && 'bg-secondary font-semibold',
                  )}
                >
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <article className="max-w-reading">
          <h1 className="text-4xl font-semibold sm:text-5xl">{policy.title}</h1>
          <p className="mt-4 text-lg text-muted-foreground">{policy.summary}</p>
          <p className="mt-2 text-xs text-muted-foreground">Last updated {policy.updated}</p>
          <div className="mt-10 space-y-8">
            {policy.sections.map((s) => (
              <section key={s.heading}>
                <h2 className="text-xl font-semibold">{s.heading}</h2>
                {s.body.map((para, i) => (
                  <p key={i} className="mt-3 leading-relaxed text-foreground/85">
                    {para}
                  </p>
                ))}
              </section>
            ))}
          </div>
        </article>
      </div>
    </PageShell>
  )
}
