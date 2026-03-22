// CF Pages catch-all function — serves index.html for all routes (SPA)
export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);

  // Let static assets through (including SEO/AIEO files)
  if (url.pathname.match(/\.(js|css|svg|png|jpg|ico|woff2?|txt|xml|json|webmanifest)$/)) {
    return context.next();
  }

  // Serve index.html for all SPA routes
  return context.env.ASSETS.fetch(new Request(new URL('/', url.origin), context.request));
};
