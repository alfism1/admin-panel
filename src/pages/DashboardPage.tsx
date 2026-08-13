import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { apiClient } from '@/core/data/apiClient';
import { Card, Skeleton } from '@/core/ui/misc';
import { Icon, type IconSpec } from '@/core/ui/icon';
import { PageShell } from '@/core/ui/PageShell';
import { useAuth } from '@/core/auth/useAuth';

interface DashboardStats {
  users: number;
  activeUsers: number;
  posts: number;
  published: number;
  roles: number;
  views: number;
}

function StatCard({
  label,
  value,
  hint,
  icon,
  to,
  loading,
}: {
  label: string;
  value: number;
  hint: string;
  icon: IconSpec;
  to: string;
  loading: boolean;
}) {
  return (
    <Card className="hover:border-primary/40 p-4 transition-colors">
      <Link to={to} className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-muted-foreground text-sm">{label}</p>
          {loading ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
          )}
          <p className="text-muted-foreground text-xs">{hint}</p>
        </div>
        <span className="bg-primary/12 text-primary flex size-9 items-center justify-center rounded-lg">
          <Icon name={icon} className="size-4" />
        </span>
      </Link>
    </Card>
  );
}

export function DashboardPage() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: DashboardStats }>('/dashboard/stats');
      return data.data;
    },
  });

  const stats = query.data;

  return (
    <PageShell
      title={`Welcome back, ${user?.name?.split(' ')[0] ?? 'there'}`}
      description="A quick look at what is happening across the panel."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Users"
          value={stats?.users ?? 0}
          hint={`${stats?.activeUsers ?? 0} active`}
          icon="users"
          to="/users"
          loading={query.isLoading}
        />
        <StatCard
          label="Posts"
          value={stats?.posts ?? 0}
          hint={`${stats?.published ?? 0} published`}
          icon="file-text"
          to="/posts"
          loading={query.isLoading}
        />
        <StatCard
          label="Roles"
          value={stats?.roles ?? 0}
          hint="Permission sets"
          icon="shield-check"
          to="/roles"
          loading={query.isLoading}
        />
        <StatCard
          label="Total views"
          value={stats?.views ?? 0}
          hint="Across all posts"
          icon="trending-up"
          to="/posts"
          loading={query.isLoading}
        />
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Adding a module</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Create one file in <code className="bg-muted rounded px-1">src/resources</code>, register
          it in <code className="bg-muted rounded px-1">src/resources/index.ts</code>, and the list,
          create, edit, view, delete, filters, search and permission gates are generated for you.
          Run <code className="bg-muted rounded px-1">pnpm gen:resource Product</code> to scaffold
          one.
        </p>
      </Card>
    </PageShell>
  );
}
