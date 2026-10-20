export type Message = {
  id: string;
  text: string;
  time: string;
  mine: boolean;
};

export type Conversation = {
  id: string;
  name: string;
  initials: string;
  category: 'personal' | 'customer' | 'group';
  lastMessage: string;
  time: string;
  unread: number;
  online?: boolean;
  verified?: boolean;
  messages: Message[];
};

export type Comment = {
  id: string;
  author: string;
  initials: string;
  text: string;
};

export type FeedPost = {
  id: string;
  authorId?: string;
  author: string;
  initials: string;
  subtitle: string;
  time: string;
  text: string;
  image: 'cafe' | 'market' | null;
  likes: number;
  liked: boolean;
  comments: Comment[];
};

export type ChannelUpdate = {
  id: string;
  author: string;
  time: string;
  text: string;
};

export type Channel = {
  id: string;
  name: string;
  initials: string;
  category: string;
  followers: string;
  color: 'lime' | 'coral' | 'blue' | 'gold';
  followed: boolean;
  description: string;
  updates: ChannelUpdate[];
};

export type AppState = {
  posts: FeedPost[];
  conversations: Conversation[];
  channels: Channel[];
  businessOpen: boolean;
};
