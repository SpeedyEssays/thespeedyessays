// Policy copy for /policies/$slug. Have this text reviewed by legal counsel
// before launch; it is written to be complete and enforceable in structure.

export type Policy = {
  slug: string
  title: string
  summary: string
  updated: string
  sections: { heading: string; body: string[] }[]
}

export const policies: Policy[] = [
  {
    slug: 'money-back-guarantee',
    title: 'Money-Back Guarantee',
    summary: 'When we don’t deliver what you ordered, you get your money back. This policy explains exactly when refunds apply and how to request one.',
    updated: '2026-10-01',
    sections: [
      {
        heading: '1. Full refunds',
        body: [
          'You are entitled to a 100% refund if: (a) you cancel the order before a writer has been assigned; (b) no writer can be assigned to your order; (c) you are charged twice for the same order; or (d) the paper is delivered after the deadline and the delay makes it unusable for you.',
          'Full refunds are issued to the original payment method within 5–7 business days of approval.',
        ],
      },
      {
        heading: '2. Partial refunds',
        body: [
          'If you cancel after a writer has started work, you receive a refund for the portion of work not yet completed, up to 70% of the order price.',
          'If the delivered paper does not meet your original instructions and a revision does not resolve the issue, our Quality Assurance team will review the order and may issue a partial or full refund of up to 100% of the order price.',
        ],
      },
      {
        heading: '3. Originality',
        body: [
          'Every paper is scanned with professional plagiarism-detection software before delivery. If an independent report shows that your paper contains plagiarised content that was not properly cited, you are entitled to a full refund.',
        ],
      },
      {
        heading: '4. How to request a refund',
        body: [
          'Open the order in your dashboard, select Cancellation and refund options, and choose Request a refund within 14 days of delivery (or within 14 days of the deadline for undelivered orders). Explain the reason and attach any supporting evidence in the order’s message thread.',
          'Our Quality Assurance team responds within 3 business days. You may be offered a free revision first, which you can accept or decline.',
        ],
      },
      {
        heading: '5. Exclusions',
        body: [
          'Refunds do not apply where instructions were changed after the order was placed, where required materials were not provided, or where the paper was approved and downloaded and no refund request was made within the 14-day window.',
        ],
      },
    ],
  },
  {
    slug: 'revision-policy',
    title: 'Revision Policy',
    summary: 'Free revisions for 14 days after delivery, as long as your original instructions stay the same.',
    updated: '2026-10-01',
    sections: [
      {
        heading: '1. Free revision window',
        body: [
          'You may request unlimited free revisions within 14 days of the delivery date for orders up to 20 pages, and within 30 days for orders over 20 pages (such as dissertation chapters).',
          'A revision is free when the requested changes are consistent with the instructions provided when the order was placed.',
        ],
      },
      {
        heading: '2. Revision deadlines',
        body: [
          'You can set a revision deadline of at least 24 hours for papers up to 10 pages and 48 hours for longer papers. Urgent revisions are prioritised at no extra cost where the original deadline allows.',
        ],
      },
      {
        heading: '3. Changes outside the original instructions',
        body: [
          'If you ask for changes that alter the topic, length, academic level, sources or other original requirements, this is treated as new work. We will quote you the difference before any work begins; you are never charged without your approval.',
        ],
      },
      {
        heading: '4. Requesting a revision',
        body: [
          'Open the order in your dashboard and click “Request revision”. Describe the changes clearly and attach any feedback you received. The same writer handles your revision wherever possible.',
        ],
      },
    ],
  },
  {
    slug: 'privacy-policy',
    title: 'Privacy & Confidentiality Policy',
    summary: 'Your identity, your order details and your payment information are kept strictly private.',
    updated: '2026-11-21',
    sections: [
      {
        heading: '1. What we collect',
        body: [
          'We collect only what is needed to fulfil your order: your email address, order details and uploaded materials, and payment confirmation from our payment processors. We do not collect or store your full card number.',
        ],
      },
      {
        heading: '2. Anonymity with writers',
        body: [
          'Writers see only an anonymous order ID and the instructions you provide. Your name, email address, phone number and institution are never shared with writers. Messages between you and your writer are monitored by our quality team, and sharing personal contact details in messages is prohibited for both parties.',
        ],
      },
      {
        heading: '3. Payment security',
        body: [
          'Online payments are handled by the payment provider shown at checkout. We use HTTPS and do not collect your card number on this website.',
        ],
      },
      {
        heading: '4. Originality checks',
        body: [
          'Papers are checked with plagiarism-detection software configured not to store your paper in any public or institutional repository, so a later submission of your paper will not be flagged against our check.',
        ],
      },
      {
        heading: '5. Data retention and your rights',
        body: [
          'You can request deletion of your account and all associated files at any time from your dashboard or by contacting support. Completed papers are deleted from our servers 90 days after delivery unless you ask us to keep them longer.',
          'We never sell your data. We use it only to provide our service, process payments and, if you opt in, send order-related updates.',
        ],
      },
      {
        heading: '6. Sign in with Google',
        body: [
          'If you choose to sign in with Google, Google provides your account identifier, email address and basic profile information, such as your name and profile photo, to Supabase Auth, our authentication provider.',
          'Supabase Auth stores this information with your account to create or link your SpeedyEssays account and manage your sign-in sessions. SpeedyEssays uses your email address and name to identify your account, and authorized support staff can see these details when helping you.',
        ],
      },
    ],
  },
]
