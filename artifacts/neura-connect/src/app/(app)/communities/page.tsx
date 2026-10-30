import { redirect } from "next/navigation";

/** Keep old community links working without exposing retired group features. */
export default function RetiredCommunitiesPage() {
  redirect("/home");
}
