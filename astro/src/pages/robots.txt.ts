import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ url }) => {
  const origin = `${url.protocol}//${url.host}`;
  const body = __ONION__
    ? 'User-agent: *\nDisallow: /\n'
    : [
        'User-agent: *',
        'Allow: /',
        'Disallow: /order',
        'Disallow: /checkout',
        'Disallow: /pay',
        'Disallow: /actions',
        '',
        `Sitemap: ${origin}/sitemap.xml`,
        '',
      ].join('\n');

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
