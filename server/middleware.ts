import { clerkMiddleware } from "@clerk/nextjs/server";

// Clerk middleware. Routes are public by default; protect specific routes
// (e.g. /api/calendar/*) as they land in M4.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpg|jpeg|png|gif|svg|ico|webp|woff2?|ttf)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
