"use client";
import { useEffect, useState } from "react";
import { useClerk } from "@clerk/react";
import { useTheme } from "next-themes";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, Monitor, Moon, ShieldOff, Sun } from "lucide-react";
import {
  useUpdateMyProfile, useUpdatePrivacySettings, getGetMyProfileQueryKey, useListBlockedUsers, getListBlockedUsersQueryKey, useUnblockUser,
  type PrivacySettingsInput, type PrivacySettingsInputAllowMessagesFrom, type PrivacySettingsInputProfileVisibility,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { PageScroll } from "@/components/page-scroll";
import { ErrorState } from "@/components/states";
import { UserAvatar } from "@/components/user-avatar";
import { useToast } from "@/hooks/use-toast";
import { basePath } from "@/lib/base";
import { errMessage } from "@/lib/format";
import { useMe } from "@/lib/me";
import { useInvalidate } from "@/lib/realtime";
import { cn } from "@/lib/utils";
import { BrowserNotificationSettings } from "@/components/browser-notifications";

function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="rise grid gap-4 border-t py-8 md:grid-cols-[220px_1fr]">
      <div><h2 className="font-display text-xl font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{sub}</p></div>
      <div>{children}</div>
    </section>
  );
}

const AUDIENCE = [["everyone", "Everyone"], ["contacts", "My contacts"], ["nobody", "Nobody"]] as const;

// ---------- Settings: profile, privacy, appearance, blocked, sign out ----------
export default function SettingsPage() {
  const me = useMe();
  const qc = useQueryClient();
  const { toast } = useToast();
  const invalidate = useInvalidate();
  const { signOut } = useClerk();
  const { theme, setTheme } = useTheme();

  // Profile form
  const [p, setP] = useState({ name: me.name, username: me.username, bio: me.bio ?? "", status: me.status ?? "" });
  useEffect(() => { setP({ name: me.name, username: me.username, bio: me.bio ?? "", status: me.status ?? "" }); }, [me.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = p.name !== me.name || p.username !== me.username || p.bio !== (me.bio ?? "") || p.status !== (me.status ?? "");
  const valid = p.name.trim().length >= 1 && /^[a-zA-Z0-9_]{3,32}$/.test(p.username);
  const updateProfile = useUpdateMyProfile({
    mutation: {
      onSuccess: (prof) => { qc.setQueryData(getGetMyProfileQueryKey(), prof); invalidate("/api/feed", "/api/chats"); toast({ title: "Profile saved" }); },
      onError: (e) => toast({ title: "Couldn't save profile", description: errMessage(e), variant: "destructive" }),
    },
  });

  // Privacy (saves immediately on change)
  const updatePrivacy = useUpdatePrivacySettings({
    mutation: {
      onSuccess: (privacy) => { qc.setQueryData(getGetMyProfileQueryKey(), { ...me, privacy }); toast({ title: "Privacy updated" }); },
      onError: (e) => toast({ title: "Couldn't update privacy", description: errMessage(e), variant: "destructive" }),
    },
  });
  const pv = updatePrivacy.isPending && updatePrivacy.variables ? updatePrivacy.variables.data : me.privacy;
  const setPrivacy = (patch: Partial<PrivacySettingsInput>) => updatePrivacy.mutate({ data: { ...me.privacy, ...patch } });

  // Blocked
  const blocked = useListBlockedUsers({ query: { queryKey: getListBlockedUsersQueryKey() } });
  const unblock = useUnblockUser({
    mutation: {
      onSuccess: () => { invalidate("/api/users", "/api/chats", "/api/feed"); toast({ title: "Unblocked" }); },
      onError: (e) => toast({ title: "Couldn't unblock", description: errMessage(e), variant: "destructive" }),
    },
  });

  return (
    <PageScroll className="max-w-4xl">
      <PageHeader kicker="Your line" title="Settings" />
      <div className="rise mt-6 flex items-center gap-4 rounded-[1.6rem] bg-[hsl(var(--ink))] p-5 text-[#f4ece0]">
        <UserAvatar id={me.id} name={me.name} src={me.avatarUrl} size="xl" online={me.online} />
        <div className="min-w-0">
          <p className="font-display truncate text-2xl font-semibold" data-testid="text-profile-name">{me.name}</p>
          <p className="text-sm text-[#f4ece0]/70">@{me.username}{me.email ? ` · ${me.email}` : ""}</p>
          {me.status ? <p className="mt-1 text-sm italic text-accent">“{me.status}”</p> : null}
        </div>
      </div>

      <div className="mt-6">
        <Section title="Profile" sub="How friends find and recognise you. Profile photos arrive with media uploads.">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); updateProfile.mutate({ data: { name: p.name.trim(), username: p.username.trim(), bio: p.bio.trim() || null, status: p.status.trim() || null } }); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="s-name">Name</Label><Input id="s-name" value={p.name} maxLength={80} onChange={(e) => setP({ ...p, name: e.target.value })} data-testid="input-name" /></div>
              <div><Label htmlFor="s-user">Username</Label><Input id="s-user" value={p.username} maxLength={32} onChange={(e) => setP({ ...p, username: e.target.value })} data-testid="input-username" />
                {!/^[a-zA-Z0-9_]{3,32}$/.test(p.username) ? <p className="mt-1 text-xs text-destructive">3–32 letters, numbers or underscores.</p> : null}</div>
            </div>
            <div><Label htmlFor="s-status">Status line</Label><Input id="s-status" value={p.status} maxLength={80} placeholder="At the allotment till 3" onChange={(e) => setP({ ...p, status: e.target.value })} data-testid="input-status-line" /></div>
            <div><Label htmlFor="s-bio">Bio</Label><Textarea id="s-bio" value={p.bio} maxLength={280} rows={3} onChange={(e) => setP({ ...p, bio: e.target.value })} data-testid="input-bio" /><p className="mt-1 text-right font-mono text-[11px] text-muted-foreground">{p.bio.length}/280</p></div>
            <Button type="submit" className="rounded-full" disabled={!dirty || !valid || updateProfile.isPending} data-testid="button-save-profile">
              {updateProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save profile
            </Button>
          </form>
        </Section>

        <Section title="Privacy" sub="Changes save instantly.">
          <div className="space-y-3">
            <div className="flex flex-col gap-2 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <Label>Who can message me</Label>
              <Select value={pv.allowMessagesFrom} onValueChange={(v) => setPrivacy({ allowMessagesFrom: v as PrivacySettingsInputAllowMessagesFrom })}>
                <SelectTrigger className="w-full rounded-xl sm:w-44" data-testid="select-allow-messages"><SelectValue /></SelectTrigger>
                <SelectContent>{AUDIENCE.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <Label>Who can see my profile</Label>
              <Select value={pv.profileVisibility} onValueChange={(v) => setPrivacy({ profileVisibility: v as PrivacySettingsInputProfileVisibility })}>
                <SelectTrigger className="w-full rounded-xl sm:w-44" data-testid="select-profile-visibility"><SelectValue /></SelectTrigger>
                <SelectContent>{AUDIENCE.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-2xl border bg-card p-4">
              <Label htmlFor="pv-online">Show when I'm online</Label>
              <Switch id="pv-online" checked={pv.showOnlineStatus} onCheckedChange={(v) => setPrivacy({ showOnlineStatus: v })} data-testid="switch-online" />
            </div>
            <div className="flex items-center justify-between rounded-2xl border bg-card p-4">
              <Label htmlFor="pv-seen">Show last seen</Label>
              <Switch id="pv-seen" checked={pv.showLastSeen} onCheckedChange={(v) => setPrivacy({ showLastSeen: v })} data-testid="switch-last-seen" />
            </div>
          </div>
        </Section>

        <Section title="Browser notifications" sub="Private alerts on this browser only.">
          <BrowserNotificationSettings />
        </Section>
        <Section title="Appearance" sub="Daylight paper or late-night ink.">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
            {([["light", "Light", Sun], ["dark", "Dark", Moon], ["system", "System", Monitor]] as const).map(([v, l, Icon]) => (
              <button key={v} role="radio" aria-checked={theme === v} onClick={() => setTheme(v)} data-testid={`button-theme-${v}`}
                className={cn("flex flex-col items-center gap-2 rounded-2xl border bg-card p-4 text-sm font-medium transition-colors", theme === v ? "border-primary text-primary ring-2 ring-primary/20" : "hover:bg-muted")}>
                <Icon className="h-5 w-5" />{l}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Blocked" sub="People you've blocked can't message you or see your activity.">
          {blocked.isLoading ? <Skeleton className="h-14 rounded-2xl" /> : null}
          {blocked.isError ? <ErrorState error={blocked.error} onRetry={() => blocked.refetch()} /> : null}
          {blocked.data?.length === 0 ? <p className="flex items-center gap-2 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground"><ShieldOff className="h-4 w-4" /> You haven't blocked anyone.</p> : null}
          <ul className="space-y-2">
            {blocked.data?.map((u) => (
              <li key={u.id} className="flex items-center gap-3 rounded-2xl border bg-card p-3" data-testid={`row-blocked-${u.id}`}>
                <UserAvatar id={u.id} name={u.name} src={u.avatarUrl} size="sm" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{u.name}</span><span className="text-xs text-muted-foreground">@{u.username}</span></span>
                <Button size="sm" variant="outline" className="rounded-full" disabled={unblock.isPending} onClick={() => unblock.mutate({ userId: u.id })} data-testid={`button-unblock-${u.id}`}>Unblock</Button>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Session" sub="Signing out clears this device's cached data.">
          <Button variant="outline" className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => { qc.clear(); signOut({ redirectUrl: `${basePath}/` }); }} data-testid="button-sign-out">
            <LogOut className="mr-1 h-4 w-4" /> Sign out
          </Button>
        </Section>
      </div>
    </PageScroll>
  );
}
