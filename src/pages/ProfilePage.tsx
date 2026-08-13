import { useAuth } from '@/core/auth/useAuth';
import { Avatar, Badge, Card } from '@/core/ui/misc';
import { PageShell } from '@/core/ui/PageShell';
import { initials } from '@/lib/labelize';

export function ProfilePage() {
  const { user } = useAuth();

  return (
    <PageShell title="Your profile" breadcrumbs={[{ label: 'Profile' }]}>
      <Card className="space-y-5 p-5">
        <div className="flex items-center gap-3">
          <Avatar src={user?.avatar} fallback={initials(user?.name ?? '?')} className="size-12" />
          <div>
            <p className="font-medium">{user?.name}</p>
            <p className="text-muted-foreground text-sm">{user?.email}</p>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Roles</h2>
          <div className="flex flex-wrap gap-1.5">
            {user?.roles.map((role) => (
              <Badge key={role} tone="primary">
                {role}
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Permissions</h2>
          <div className="flex flex-wrap gap-1.5">
            {user?.permissions.map((permission) => (
              <Badge key={permission}>{permission}</Badge>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            These gates shape the UI only. The backend remains the source of truth.
          </p>
        </div>
      </Card>
    </PageShell>
  );
}
