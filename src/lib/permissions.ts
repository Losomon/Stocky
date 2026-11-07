// Configurable role-based permissions for staff.
// Defaults match the suggested matrix (owner / manager / worker).
// "Limited" from the suggestion is modelled as no manage rights:
// workers can view the dashboard and record sales, but cannot change
// product, purchase, worker or business records.
export type Role = "owner" | "manager" | "worker";
export type Permission =
  | "view.dashboard"
  | "record.sales"
  | "manage.products"
  | "manage.purchases"
  | "view.reports"
  | "manage.workers"
  | "manage.business";

export type BusinessRole = "owner" | "admin" | "manager" | "cashier";

export const fromBusinessRole = (role: BusinessRole | null): Role | null => {
  if (!role) return null;
  if (role === "owner") return "owner";
  if (role === "admin" || role === "manager") return "manager";
  return "worker"; // cashier
};

export interface RoleDefinition {
  key: Role;
  label: string;
  permissions: Permission[];
}

export const DEFAULT_ROLES: Record<Role, RoleDefinition> = {
  owner: {
    key: "owner",
    label: "Owner",
    permissions: [
      "view.dashboard",
      "record.sales",
      "manage.products",
      "manage.purchases",
      "view.reports",
      "manage.workers",
      "manage.business",
    ],
  },
  manager: {
    key: "manager",
    label: "Manager",
    permissions: [
      "view.dashboard",
      "record.sales",
      "manage.products",
      "manage.purchases",
      "view.reports",
    ],
  },
  worker: {
    key: "worker",
    label: "Worker",
    permissions: ["view.dashboard", "record.sales"],
  },
};

export type RoleConfig = Record<Role, Permission[]>;

export const defaultConfig: RoleConfig = {
  owner: DEFAULT_ROLES.owner.permissions,
  manager: DEFAULT_ROLES.manager.permissions,
  worker: DEFAULT_ROLES.worker.permissions,
};

export class Permissions {
  private config: RoleConfig;
  constructor(config: RoleConfig = defaultConfig) {
    this.config = config;
  }
  /** Replace the whole permission map (used when roles are made configurable). */
  setConfig(config: RoleConfig) {
    this.config = { ...defaultConfig, ...config };
    for (const role of ["owner", "manager", "worker"] as const) {
      if (!(role in config)) this.config[role] = [...defaultConfig[role]];
    }
  }
  /** Update one role's permissions. Owner retains manage.workers and manage.business. */
  setRole(role: Role, permissions: Permission[]) {
    const next = { ...this.config, [role]: permissions };
    // Owner cannot lose worker/business management.
    if (role === "owner") {
      for (const p of ["manage.workers", "manage.business"]) {
        if (!next.owner.includes(p)) next.owner.push(p);
      }
    }
    this.config = next;
  }
  can(role: Role | null, permission: Permission): boolean {
    if (!role) return false; // no authenticated identity: nothing is permitted by default
    return this.config[role]?.includes(permission) ?? false;
  }
  roleFor(label: string): Role | null {
    for (const [key, def] of Object.entries(DEFAULT_ROLES)) {
      if (def.label.toLowerCase() === label.toLowerCase() || key === label) return key as Role;
    }
    return null;
  }
}

export const permissions = new Permissions();

export const LABEL_BY_ROLE: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  worker: "Worker",
};
