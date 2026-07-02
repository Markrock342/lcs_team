"use client";

import { createContext, useContext } from "react";
import type { Profile, TeamRole } from "@/lib/types";
import {
  canEdit as canEditFn,
  canViewFinance as canViewFinanceFn,
  isAdmin as isAdminFn,
  isGuest as isGuestFn,
  hasPermission as hasPermissionFn,
  type Permission,
} from "@/lib/permissions";

type RoleContextValue = {
  profile: Profile | null;
  role: TeamRole | null;
  isGuest: boolean;
  isAdmin: boolean;
  canEdit: boolean;
  canViewFinance: boolean;
  can: (permission: Permission) => boolean;
};

const RoleContext = createContext<RoleContextValue>({
  profile: null,
  role: null,
  isGuest: false,
  isAdmin: false,
  canEdit: true,
  canViewFinance: true,
  can: () => false,
});

export function RoleProvider({
  profile,
  children,
}: {
  profile: Profile | null;
  children: React.ReactNode;
}) {
  const role = profile?.role ?? null;
  const value: RoleContextValue = {
    profile,
    role,
    isGuest: isGuestFn(role),
    isAdmin: role ? isAdminFn(role) : false,
    canEdit: canEditFn(role),
    canViewFinance: canViewFinanceFn(role),
    can: (permission) => (role ? hasPermissionFn(role, permission) : false),
  };
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}
