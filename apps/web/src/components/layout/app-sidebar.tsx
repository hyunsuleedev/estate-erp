import { useAuth } from "@/providers/auth-provider";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { getNavGroups } from "@/components/layout/nav-config";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
} from "@/components/ui/sidebar";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user, logout } = useAuth();
  const groups = getNavGroups(user?.role);

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarContent>
        {groups.map((group) => (
          <NavMain key={group.key} label={group.label} items={group.items} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={{
            name: user?.name ?? "",
            email: user?.email ?? "",
          }}
          onLogout={logout}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
