import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ url }) => {
  // Clearnet always advertises the canonical origin, even when the request
  // arrives through the Pages proxy at astro.walls.rip.
  const origin = __ONION__ ? `${url.protocol}//${url.host}` : 'https://walls.rip';
  const body = __ONION__
    ? 'User-agent: *\nDisallow: /\n'
    : [
        'User-agent: *',
        'Allow: /',
        'Disallow: /order',
        'Disallow: /checkout',
        'Disallow: /pay',
        'Disallow: /actions',
        'Disallow: /sms/purchase',
        'Disallow: /sms/check',
        'Disallow: /phone/purchase',
        'Disallow: /vpn/purchase',
        'Disallow: /vpn/order',
        'Disallow: /vpn/config',
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
