import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { ROLE_LABELS } from "@/lib/permissions";
import type { WorkspaceMember } from "@/lib/workspaces";

export function MemberList({ members }: { members: WorkspaceMember[] }) {
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {members.map((member) => (
        <li key={member.userId} className="flex items-center gap-3 px-4 py-3">
          <UserAvatar name={member.fullName} email={member.email} avatarUrl={member.avatarUrl} className="size-9" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{member.fullName || member.email}</p>
            <p className="truncate text-xs text-muted-foreground">{member.email}</p>
          </div>
          <Badge variant={member.role === "owner" ? "default" : "secondary"}>{ROLE_LABELS[member.role]}</Badge>
        </li>
      ))}
    </ul>
  );
}
