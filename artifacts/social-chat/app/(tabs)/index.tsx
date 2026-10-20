import { Redirect } from 'expo-router';

/** The old home feed now lives inside Videos as one combined stream. */
export default function LegacyFeedRedirect() {
  return <Redirect href="/videos" />;
}
