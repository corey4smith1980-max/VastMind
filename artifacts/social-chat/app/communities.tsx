import { Redirect } from "expo-router";

/** Legacy community links now lead to the combined social feed. */
export default function RetiredCommunitiesRoute() {
  return <Redirect href="/videos" />;
}
