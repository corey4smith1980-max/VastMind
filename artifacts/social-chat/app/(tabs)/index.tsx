import { Redirect } from 'expo-router';

/** The combined social feed lives in the Feed tab, together with short clips. */
export default function LegacyFeedRedirect() {
  return <Redirect href="/videos" />;
}
