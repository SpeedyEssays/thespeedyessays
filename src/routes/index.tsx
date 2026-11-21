import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowRight,
  BadgeCheck,
  FileSearch,
  GraduationCap,
  Lock,
  RefreshCcw,
  ShieldCheck,
  Star,
  Wallet,
} from 'lucide-react'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { PageShell } from '@/components/site/page-shell'
import { PricingCalculator } from '@/components/site/pricing-calculator'
import { Stars } from '@/components/site/stars'
import { PaymentBadges } from '@/components/site/trust-badges'
import { reviews, samples, stats } from '@/lib/fixtures'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      {
        name: 'google-site-verification',
        content: 'Ri1HhidTlbFiyooF9TmKFEuFbBPqh5Gs_ke46eF9Rq0',
      },
    ],
  }),
  component: Home,
})

const guarantees = [
  {
    icon: FileSearch,
    title: 'Free originality report',
    body: 'Every paper is scanned with professional plagiarism-detection software before delivery. Download the report from your dashboard.',
    link: { slug: 'privacy-policy', label: 'How we check' },
  },
  {
    icon: RefreshCcw,
    title: 'Free revisions for 14 days',
    body: 'Not quite right? Request unlimited revisions within 14 days of delivery as long as your original instructions stay the same.',
    link: { slug: 'revision-policy', label: 'Revision policy' },
  },
  {
    icon: Wallet,
    title: 'Money-back guarantee',
    body: 'Late delivery, a missed requirement, or a paper that fails our quality standards — you are entitled to a full or partial refund.',
    link: { slug: 'money-back-guarantee', label: 'Refund terms' },
  },
  {
    icon: Lock,
    title: 'Strictly confidential',
    body: 'Writers only see an anonymous order ID. We never share your name, email, or institution, and payments are SSL-encrypted.',
    link: { slug: 'privacy-policy', label: 'Privacy policy' },
  },
] as const

const steps = [
  { title: 'Share your brief', body: 'Pick the assignment type, level, style and deadline, then upload your prompt and rubric.' },
  { title: 'Get matched', body: 'A vetted writer with a degree in your subject is assigned, usually within 15 minutes.' },
  { title: 'Collaborate privately', body: 'Message your writer anonymously, preview drafts, and track progress in your dashboard.' },
  { title: 'Download & review', body: 'Receive your paper with an originality report. Free revisions for 14 days.' },
]

const faqs = [
  { q: 'Who writes my paper?', a: 'Every writer holds at least a bachelor’s degree, passes an English proficiency and academic writing test, and has their diploma verified before taking orders. Most of our team hold a master’s or PhD.' },
  { q: 'How is the price calculated?', a: 'Price depends on academic level, deadline and page count. Longer deadlines cost less. The calculator shows the exact amount you pay — there are no hidden fees.' },
  { q: 'Which payment methods do you accept?', a: 'Available payment options appear in your dashboard after you save an order. Card details are entered with the payment provider.' },
  { q: 'Can I talk to my writer?', a: 'Yes. Your dashboard includes a private messaging thread with your writer. It is monitored by our quality team and neither side sees the other’s contact information.' },
  { q: 'What if I need changes?', a: 'Request a revision from your dashboard within 14 days of delivery. Revisions are free as long as the original instructions have not changed.' },
]

function Home() {
  const featuredSamples = samples.slice(0, 3)

  return (
    <PageShell>
      {/* Hero + calculator */}
      <section className="paper-grain relative overflow-hidden border-b">
        <div className="mx-auto grid max-w-content items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:py-20">
          <div>
            <a
              href="#reviews"
              className="mb-6 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm shadow-sm"
            >
              <Stars rating={5} />
              <span className="font-semibold">{stats.rating}/5</span>
              <span className="text-muted-foreground">from {stats.reviewCount.toLocaleString()} verified reviews</span>
            </a>
            <h1 className="text-4xl leading-[1.05] font-semibold sm:text-5xl lg:text-6xl">
              Academic writing help from writers who’ve <em className="text-primary/80">earned</em> their degrees.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Essays, research papers, case studies and dissertation chapters — written from scratch to your rubric, checked for
              originality, and delivered on time. From high school to PhD.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link to="/order">
                  Start your order <ArrowRight />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/samples">Browse sample papers</Link>
              </Button>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6 border-t pt-6">
              <div>
                <dt className="text-xs text-muted-foreground">Verified writers</dt>
                <dd className="font-display text-2xl font-semibold">{stats.writers}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Papers delivered</dt>
                <dd className="font-display text-2xl font-semibold">{(stats.ordersDelivered / 1000).toFixed(0)}k+</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">On-time rate</dt>
                <dd className="font-display text-2xl font-semibold">{stats.onTime}%</dd>
              </div>
            </dl>
          </div>
          <div id="pricing" className="scroll-mt-24">
            <PricingCalculator />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto grid max-w-content items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
        <div className="relative">
          <img
            src="/img/hero-study.png"
            sizes="(min-width: 1024px) 560px, 100vw"
            alt="An open academic journal with handwritten notes, a fountain pen and a stack of books on a wooden desk"
            width={1264}
            height={848}
            loading="lazy"
            className="aspect-[3/2] w-full rounded-2xl object-cover shadow-xl"
          />
          <div className="absolute -bottom-6 left-6 flex items-center gap-3 rounded-xl border bg-card p-4 shadow-lg">
            <span className="grid size-10 place-items-center rounded-full bg-success/15 text-success">
              <BadgeCheck className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">99% average originality</p>
              <p className="text-xs text-muted-foreground">Report included with every order</p>
            </div>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold tracking-wide text-primary/70 uppercase">How it works</p>
          <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">From brief to finished paper in four steps</h2>
          <ol className="mt-8 space-y-6">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-primary font-display font-semibold">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-sans text-base font-semibold tracking-normal">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Guarantees */}
      <section className="border-y bg-secondary/60">
        <div className="mx-auto max-w-content px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold tracking-wide text-primary/70 uppercase">Our guarantees</p>
            <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">Quality you can verify, not just trust</h2>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {guarantees.map((g) => (
              <div key={g.title} className="flex flex-col rounded-xl border bg-card p-6">
                <g.icon className="size-7 text-primary" />
                <h3 className="mt-4 font-sans text-lg font-semibold tracking-normal">{g.title}</h3>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{g.body}</p>
                <Link
                  to="/policies/$slug"
                  params={{ slug: g.link.slug }}
                  className="mt-4 text-sm font-semibold text-primary underline-offset-4 hover:underline"
                >
                  {g.link.label} →
                </Link>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-col items-start gap-3 rounded-xl border bg-card p-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="size-6 text-success" />
              <p className="text-sm">
                <span className="font-semibold">Secure checkout.</span>{' '}
                <span className="text-muted-foreground">When online payment is available, checkout opens on the payment provider’s website.</span>
              </p>
            </div>
            <PaymentBadges />
          </div>
        </div>
      </section>

      {/* Samples */}
      <section className="mx-auto max-w-content px-4 py-20 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-wide text-primary/70 uppercase">Sample papers</p>
            <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">See the standard before you order</h2>
          </div>
          <Button variant="outline" asChild>
            <Link to="/samples">View all samples</Link>
          </Button>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {featuredSamples.map((s) => (
            <Link
              key={s.id}
              to="/samples"
              hash={s.id}
              className="group rounded-xl border bg-card p-6 transition-shadow hover:shadow-lg motion-reduce:transition-none"
            >
              <p className="text-xs font-semibold tracking-wide text-primary/70 uppercase">
                {s.subject} · {s.level}
              </p>
              <h3 className="mt-2 text-lg leading-snug font-semibold group-hover:underline">{s.title}</h3>
              <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{s.excerpt}</p>
              <p className="mt-4 text-xs text-muted-foreground">
                {s.type} · {s.style} · {s.pages} pages
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Reviews */}
      <section id="reviews" className="scroll-mt-16 bg-primary text-primary-foreground">
        <div className="mx-auto max-w-content px-4 py-20 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm font-semibold tracking-wide text-accent uppercase">Verified reviews</p>
              <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">Students who’ve been where you are</h2>
            </div>
            <div className="flex gap-4">
              {[
                { name: 'Trustpilot', score: '4.8' },
                { name: 'Sitejabber', score: '4.9' },
              ].map((p) => (
                <div key={p.name} className="rounded-lg border border-primary-foreground/15 px-4 py-2">
                  <p className="text-xs text-primary-foreground/70">{p.name}</p>
                  <p className="flex items-center gap-1 font-display text-xl font-semibold">
                    {p.score} <Star className="size-4 fill-accent text-accent" />
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {reviews.map((r) => (
              <figure key={r.id} className="flex flex-col rounded-xl bg-primary-foreground/[0.06] p-6">
                <Stars rating={r.rating} />
                <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-primary-foreground/90">“{r.body}”</blockquote>
                <figcaption className="mt-5 flex items-center justify-between text-xs">
                  <span>
                    <span className="font-semibold">{r.name}</span>{' '}
                    <span className="text-primary-foreground/60">
                      · {r.level}, {r.subject}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-primary-foreground/60">
                    <BadgeCheck className="size-3.5 text-accent" /> {r.source}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ + CTA */}
      <section className="mx-auto grid max-w-content gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.3fr]">
        <div>
          <p className="text-sm font-semibold tracking-wide text-primary/70 uppercase">Questions</p>
          <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">Everything you need to know</h2>
          <p className="mt-4 text-muted-foreground">
            Still unsure? Send our support team a message using the chat in the corner.
          </p>
          <div className="mt-8 rounded-xl border bg-card p-6">
            <GraduationCap className="size-7 text-primary" />
            <h3 className="mt-3 font-sans text-lg font-semibold tracking-normal">Ready when you are</h3>
            <p className="mt-1 text-sm text-muted-foreground">Place an order in under five minutes. Pay only when you’re happy with the quote.</p>
            <Button className="mt-4" asChild>
              <Link to="/order">Place an order</Link>
            </Button>
          </div>
        </div>
        <Accordion type="single" collapsible className="w-full">
          {faqs.map((f) => (
            <AccordionItem key={f.q} value={f.q}>
              <AccordionTrigger className="text-base">{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </PageShell>
  )
}
