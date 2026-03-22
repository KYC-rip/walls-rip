import { Helmet } from '@dr.pogodin/react-helmet';

interface SEOProps {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  schema?: Record<string, unknown>;
  schemas?: Record<string, unknown>[];
}

const SITE_URL = 'https://walls.rip';

const ORG_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'walls.rip',
  url: SITE_URL,
  logo: `${SITE_URL}/favicon.svg`,
  description: 'Anonymous communication toolkit. Burner email, encrypted dead drops, anonymous SMS — no identity, no logs.',
  parentOrganization: {
    '@type': 'Organization',
    name: 'KYC.RIP',
    url: 'https://kyc.rip',
  },
  sameAs: [
    'https://x.com/XBToshi',
    'https://x.com/kyc_rip',
  ],
};

const WEBSITE_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'walls.rip',
  url: SITE_URL,
  description: 'Break walls for anonymous communication. Burner email, dead drops, SMS verification — privacy-first tools.',
};

export function SEO({
  title = 'walls.rip — Break walls for anonymous communication',
  description = 'Anonymous communication toolkit. Ghost Mail burner email, encrypted dead drops, anonymous SMS verification — no identity, no logs, no walls.',
  path = '',
  image,
  schema,
  schemas,
}: SEOProps) {
  const url = `${SITE_URL}${path}`;
  const ogImage = image ? `${SITE_URL}${image}` : `${SITE_URL}/og-image.jpg`;

  const allSchemas: Record<string, unknown>[] = [ORG_SCHEMA, WEBSITE_SCHEMA];
  if (schema) allSchemas.push(schema);
  if (schemas) allSchemas.push(...schemas);

  return (
    <Helmet>
      <html lang="en" />

      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />

      <meta name="geo.placename" content="Global" />
      <meta name="coverage" content="Worldwide" />
      <meta name="topic" content="Anonymous Communication Tools" />
      <meta name="subject" content="Privacy, Communication, Encryption, Anonymous Email, SMS" />
      <meta name="classification" content="Privacy, Communication, Security" />

      <meta property="og:type" content="website" />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:site_name" content="walls.rip" />
      <meta property="og:locale" content="en_US" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={url} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:site" content="@kyc_rip" />
      <meta name="twitter:creator" content="@XBToshi" />

      {allSchemas.map((s, i) => (
        <script key={i} type="application/ld+json" data-rh="true">
          {JSON.stringify(s)}
        </script>
      ))}
    </Helmet>
  );
}

export function buildFAQSchema(faqs: { question: string; answer: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}
