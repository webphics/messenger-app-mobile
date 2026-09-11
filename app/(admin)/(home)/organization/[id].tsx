import { Redirect, useLocalSearchParams } from "expo-router";

import { OrganizationMembersScreen } from "@/components/hub/organization-members-screen";
import { ROLE_HREF } from "@/lib/hub-routes";
import { getSession } from "@/lib/session";

export default function AdminOrganizationScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const organizationId = Array.isArray(id) ? id[0] : id;
  const role = getSession().role;

  if (!organizationId) return <Redirect href={ROLE_HREF[role]} />;

  return <OrganizationMembersScreen organizationId={organizationId} />;
}
