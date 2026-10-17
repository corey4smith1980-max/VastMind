import type { Conversation, ConversationMember } from "@workspace/api-client-react";

export function otherMember(c: Conversation, meId: string): ConversationMember | undefined {
  return c.members.find((m) => m.user.id !== meId) ?? c.members[0];
}

export function chatTitle(c: Conversation, meId: string) {
  if (c.type === "group") {
    return c.name || c.members.filter((m) => m.user.id !== meId).map((m) => m.user.name.split(" ")[0]).slice(0, 3).join(", ") || "Group";
  }
  return otherMember(c, meId)?.user.name ?? "Conversation";
}
