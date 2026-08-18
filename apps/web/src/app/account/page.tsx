import { redirect } from "next/navigation";

/**
 * The account page became the profile page.
 *
 * Kept as a redirect rather than deleted: the old path is in menus people have
 * bookmarked, in the docs, and in at least one release note.
 */
export default function AccountPage() {
  redirect("/profile");
}
