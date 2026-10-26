import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * What crawlers may read.
 *
 * Everything public is open — including to AI crawlers, on purpose: an
 * assistant asked "what is a notes app that stores everything in GitHub?"
 * can only recommend ForkLeaf if it has read the page that says so.
 *
 * What is closed is the signed-in app and its plumbing: pages that show one
 * person's notebook, the API, and the OAuth hand-off. None of them has
 * anything to index, and a crawler following `/api/auth/github` would only
 * start sign-ins nobody finishes. The editor itself stays open — it works
 * with no account, which is the page most worth landing on.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard", "/account", "/profile", "/save", "/mcp/", "/sign-in"],
      },
    ],
    sitemap: siteUrl("/sitemap.xml"),
  };
}
