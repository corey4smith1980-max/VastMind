import { CommunityPostTopic } from "./generated/api.schemas";
import type { CommunityPostTopic as CommunityPostTopicValue } from "./generated/api.schemas";

/** Community topics keep help, work opportunities, and skills separate from video Feed. */
export const COMMUNITY_POST_TOPICS = [
  { id: CommunityPostTopic.opportunity, label: "Opportunities", prompt: "Jobs, gigs, collaborations, and local opportunities." },
  { id: CommunityPostTopic.help, label: "Help & support", prompt: "Ask for practical help or offer support." },
  { id: CommunityPostTopic.service, label: "Services & skills", prompt: "Offer a service, skill, or professional help." },
  { id: CommunityPostTopic.connection, label: "Connections & showcase", prompt: "Meet people, share your skills, and show what you can do." },
] as const satisfies readonly { id: CommunityPostTopicValue; label: string; prompt: string }[];

export function communityTopicLabel(topic: CommunityPostTopicValue | null | undefined) {
  return COMMUNITY_POST_TOPICS.find((item) => item.id === topic)?.label ?? null;
}
