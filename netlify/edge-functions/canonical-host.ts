export function canonicalHostRedirect(requestUrl: URL): Response | null {
  if (requestUrl.hostname !== 'www.yovibe.net' && requestUrl.protocol === 'https:') return null;
  const canonicalUrl = new URL(requestUrl.toString());
  canonicalUrl.protocol = 'https:';
  canonicalUrl.hostname = 'yovibe.net';
  return Response.redirect(canonicalUrl, 301);
}

export default async (request: Request, context: any) => {
  const redirect = canonicalHostRedirect(new URL(request.url));
  return redirect || context.next();
};
