// Stubbed data for the first milestone. Every screen that will later read from
// Netlify Database or Blobs imports from this module, so swapping in real
// persistence means replacing these exports with loaders/server functions.

export type OrderStatus = 'awaiting-payment' | 'writer-assigned' | 'in-progress' | 'draft-ready' | 'revision' | 'completed'

export type Order = {
  id: string
  title: string
  type: string
  level: string
  style: string
  subject: string
  pages: number
  deadline: string // ISO
  placedAt: string // ISO
  price: number
  status: OrderStatus
  progress: number
  writerAlias: string
  originalityScore?: number
  revisionsLeftUntil?: string // ISO, end of free-revision window
  files: { name: string; size: string; kind: 'paper' | 'report' | 'brief' }[]
}

export const statusMeta: Record<OrderStatus, { label: string; tone: 'muted' | 'info' | 'warn' | 'ok' }> = {
  'awaiting-payment': { label: 'Awaiting payment', tone: 'warn' },
  'writer-assigned': { label: 'Writer assigned', tone: 'info' },
  'in-progress': { label: 'In progress', tone: 'info' },
  'draft-ready': { label: 'Draft ready', tone: 'info' },
  revision: { label: 'In revision', tone: 'warn' },
  completed: { label: 'Completed', tone: 'ok' },
}

export const orderTimeline: { status: OrderStatus; label: string }[] = [
  { status: 'awaiting-payment', label: 'Order placed' },
  { status: 'writer-assigned', label: 'Writer assigned' },
  { status: 'in-progress', label: 'Writing' },
  { status: 'draft-ready', label: 'Draft review' },
  { status: 'completed', label: 'Delivered' },
]

export const demoClient = { name: 'Jordan M.', email: 'jordan.m@example.edu', balance: 12.5 }

export const orders: Order[] = [
  {
    id: 'SE-48213',
    title: 'Evidence-based interventions for reducing hospital-acquired infections',
    type: 'Research Paper',
    level: 'Undergraduate',
    style: 'APA 7',
    subject: 'Nursing',
    pages: 8,
    deadline: '2026-10-21T17:00:00Z',
    placedAt: '2026-10-14T09:12:00Z',
    price: 86.4,
    status: 'in-progress',
    progress: 55,
    writerAlias: 'Writer #2741',
    files: [{ name: 'NURS340_assignment_brief.pdf', size: '214 KB', kind: 'brief' }],
  },
  {
    id: 'SE-48107',
    title: 'Porter’s Five Forces analysis of the European EV market',
    type: 'Case Study',
    level: "Master's",
    style: 'Harvard',
    subject: 'Business',
    pages: 6,
    deadline: '2026-10-18T12:00:00Z',
    placedAt: '2026-10-12T15:40:00Z',
    price: 97.2,
    status: 'draft-ready',
    progress: 80,
    writerAlias: 'Writer #1188',
    files: [
      { name: 'MBA_case_rubric.docx', size: '48 KB', kind: 'brief' },
      { name: 'SE-48107_draft_v1.docx', size: '96 KB', kind: 'paper' },
    ],
  },
  {
    id: 'SE-47790',
    title: 'The Treaty of Versailles and the origins of the Second World War',
    type: 'Essay',
    level: 'Undergraduate',
    style: 'Chicago',
    subject: 'History',
    pages: 5,
    deadline: '2026-10-09T23:00:00Z',
    placedAt: '2026-10-02T10:05:00Z',
    price: 44.8,
    status: 'completed',
    progress: 100,
    writerAlias: 'Writer #2741',
    originalityScore: 99,
    revisionsLeftUntil: '2026-10-23T23:00:00Z',
    files: [
      { name: 'SE-47790_final.docx', size: '112 KB', kind: 'paper' },
      { name: 'SE-47790_originality_report.pdf', size: '388 KB', kind: 'report' },
    ],
  },
  {
    id: 'SE-46912',
    title: 'Annotated bibliography: cognitive behavioural therapy for adolescent anxiety',
    type: 'Annotated Bibliography',
    level: 'Undergraduate',
    style: 'APA 7',
    subject: 'Psychology',
    pages: 4,
    deadline: '2026-09-15T18:00:00Z',
    placedAt: '2026-09-08T08:30:00Z',
    price: 32,
    status: 'completed',
    progress: 100,
    writerAlias: 'Writer #0932',
    originalityScore: 100,
    revisionsLeftUntil: '2026-09-29T18:00:00Z',
    files: [
      { name: 'SE-46912_final.docx', size: '74 KB', kind: 'paper' },
      { name: 'SE-46912_originality_report.pdf', size: '301 KB', kind: 'report' },
    ],
  },
]

export type Message = { id: string; from: 'client' | 'writer' | 'support'; body: string; at: string }

export const messagesByOrder: Record<string, Message[]> = {
  'SE-48213': [
    { id: 'm1', from: 'support', body: 'Writer #2741 has been assigned to your order. All messages are monitored by our quality team and your contact details stay private.', at: '2026-10-14T10:02:00Z' },
    { id: 'm2', from: 'writer', body: 'Hi! I’ve read the brief. Should the paper focus on acute-care settings only, or include long-term care facilities too?', at: '2026-10-14T13:20:00Z' },
    { id: 'm3', from: 'client', body: 'Acute care only please — my professor wants us to use at least 6 peer-reviewed sources from the last 5 years.', at: '2026-10-14T14:01:00Z' },
    { id: 'm4', from: 'writer', body: 'Perfect, noted. I’ll share an outline tomorrow so you can confirm the structure.', at: '2026-10-14T14:15:00Z' },
  ],
  'SE-48107': [
    { id: 'm1', from: 'writer', body: 'The first draft is uploaded. Let me know if you’d like more depth on the threat of new entrants section.', at: '2026-10-16T18:44:00Z' },
  ],
  'SE-47790': [
    { id: 'm1', from: 'writer', body: 'Final version uploaded with the originality report. Good luck with your submission!', at: '2026-10-09T20:10:00Z' },
    { id: 'm2', from: 'client', body: 'Thank you, it reads really well.', at: '2026-10-09T21:00:00Z' },
  ],
  'SE-46912': [],
}

export type Sample = {
  id: string
  title: string
  subject: string
  type: string
  level: string
  style: string
  pages: number
  excerpt: string
}

export const samples: Sample[] = [
  {
    id: 'health-care-policy-reform',
    title: 'Recommendations for Health Care Policy Reform',
    subject: 'Health Policy',
    type: 'Policy Analysis',
    level: 'University',
    style: 'APA-style',
    pages: 7,
    excerpt:
      'Examines barriers to healthcare access and affordability, then evaluates policy changes to improve both.',
  },
  {
    id: 'tableau-and-power-bi-visual-analytics',
    title: 'Visual Analytics with Tableau and Power BI',
    subject: 'Data Analytics',
    type: 'Comparative Report',
    level: 'University',
    style: 'APA-style',
    pages: 5,
    excerpt:
      'Compares Tableau and Power BI using example dashboards, visualization features, and recommendations for different users.',
  },
  {
    id: 'restaurant-employee-retention',
    title: 'Effective Strategies Restaurant Owners Use to Retain Employees',
    subject: 'Business',
    type: 'Problem Statement',
    level: 'University',
    style: 'APA-style',
    pages: 3,
    excerpt:
      'Defines a research problem and purpose around staff turnover and retention in the restaurant industry.',
  },
  {
    id: 'sartre-and-nietzsche-on-ignorance',
    title: 'Sartre and Nietzsche on Ignorance',
    subject: 'Philosophy',
    type: 'Comparative Essay',
    level: 'University',
    style: 'MLA-style',
    pages: 5,
    excerpt:
      'Compares Sartre and Nietzsche on whether ignorance offers relief and what each thinker regards as an authentic response to difficulty.',
  },
  {
    id: 'clinical-laboratory-technology-graduates',
    title: 'Clinical Laboratory Technology Graduates in Practice',
    subject: 'Health Sciences',
    type: 'Proposal Chapter',
    level: 'University',
    style: 'APA-style',
    pages: 14,
    excerpt:
      'Outlines the background, objectives, and theoretical framework for a qualitative study of recent clinical laboratory technology graduates.',
  },
  {
    id: 'george-washington-mural-debate',
    title: 'The Debate over the George Washington Mural',
    subject: 'Art History',
    type: 'Critical Response',
    level: 'University',
    style: 'APA-style',
    pages: 3,
    excerpt:
      'Weighs historical context, public impact, and artistic significance in the debate over preserving Victor Arnautoff’s mural.',
  },
  {
    id: 'new-orleans-homicide-research',
    title: 'Research on Homicide Rates in New Orleans',
    subject: 'Criminology',
    type: 'Annotated Bibliography',
    level: 'University',
    style: 'APA-style',
    pages: 11,
    excerpt:
      'Summarizes research on homicide, neighborhood conditions, and violence prevention in New Orleans.',
  },
  {
    id: 'mindfulness-and-student-stress',
    title: 'Mindfulness Meditation and Student Stress',
    subject: 'Research Methods',
    type: 'Study Design',
    level: 'University',
    style: 'APA-style',
    pages: 3,
    excerpt:
      'Uses the PICOT framework to design a proposed study of mindfulness meditation and stress among college students.',
  },
]

export type Review = { id: string; name: string; level: string; subject: string; rating: number; body: string; date: string; source: 'Trustpilot' | 'Sitejabber' | 'Verified order' }

export const reviews: Review[] = [
  { id: 'r1', name: 'Amara K.', level: 'Undergraduate', subject: 'Nursing', rating: 5, body: 'My care plan came back two days early with every source from the last five years, exactly as the rubric required. The writer even flagged a requirement I had missed.', date: '2026-10-02', source: 'Trustpilot' },
  { id: 'r2', name: 'Daniel R.', level: "Master's", subject: 'Business', rating: 5, body: 'The case study analysis was sharp and properly referenced in Harvard. Messaging the writer directly made the revisions painless.', date: '2026-09-27', source: 'Sitejabber' },
  { id: 'r3', name: 'Priya S.', level: 'PhD', subject: 'Economics', rating: 4, body: 'Strong literature review with a clear structure. I asked for one revision to tighten the methodology section and it was turned around within a day.', date: '2026-09-19', source: 'Verified order' },
  { id: 'r4', name: 'Luis G.', level: 'High School', subject: 'History', rating: 5, body: 'Super clear essay and the originality report gave me peace of mind. Pricing was exactly what the calculator showed.', date: '2026-09-11', source: 'Trustpilot' },
  { id: 'r5', name: 'Hannah W.', level: 'Undergraduate', subject: 'Psychology', rating: 5, body: 'Live chat answered my question at 2am and the order was updated instantly. Genuinely impressed.', date: '2026-08-30', source: 'Sitejabber' },
  { id: 'r6', name: 'Marcus T.', level: "Master's", subject: 'Nursing', rating: 5, body: 'Professional, on time, and confidential. I never had to share my email or phone with the writer.', date: '2026-08-22', source: 'Verified order' },
]

export const stats = { rating: 4.9, reviewCount: 1027, writers: 218, ordersDelivered: 3000, onTime: 98.7 }
