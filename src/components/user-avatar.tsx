import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function initials(name: string, fallback: string): string {
  const source = name.trim() || fallback;
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

type UserAvatarProps = {
  name: string;
  email: string;
  avatarUrl: string | null;
  className?: string;
};

export function UserAvatar({ name, email, avatarUrl, className }: UserAvatarProps) {
  return (
    <Avatar className={className}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
      <AvatarFallback className="bg-accent text-accent-foreground">{initials(name, email)}</AvatarFallback>
    </Avatar>
  );
}
