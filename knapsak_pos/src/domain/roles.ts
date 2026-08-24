import type { PosRole } from './types';

export const POS_ROLES: readonly PosRole[] = [
  'owner',
  'manager',
  'cashier',
  'accountant',
] as const;

export function isPosRole(value: unknown): value is PosRole {
  return typeof value === 'string' && (POS_ROLES as readonly string[]).includes(value);
}

export function canAccessPos(role: PosRole | null | undefined): boolean {
  return role != null && isPosRole(role);
}

export function canManageBooks(role: PosRole | null | undefined): boolean {
  return role === 'owner' || role === 'manager' || role === 'accountant';
}

export function canBootstrapFinance(role: PosRole | null | undefined): boolean {
  return role === 'owner';
}

export function canSell(role: PosRole | null | undefined): boolean {
  return role === 'owner' || role === 'manager' || role === 'cashier';
}

export function canAdjustInventory(role: PosRole | null | undefined): boolean {
  return role === 'owner' || role === 'manager';
}

export function canPurchase(role: PosRole | null | undefined): boolean {
  return role === 'owner' || role === 'manager';
}

export function canBank(role: PosRole | null | undefined): boolean {
  return role === 'owner' || role === 'manager' || role === 'accountant';
}

export function canManageCustomers(role: PosRole | null | undefined): boolean {
  return role === 'owner' || role === 'manager';
}

export function canManageReceivables(role: PosRole | null | undefined): boolean {
  return role === 'owner' || role === 'manager' || role === 'accountant';
}

export function canClosePeriod(role: PosRole | null | undefined): boolean {
  return role === 'owner' || role === 'accountant';
}

export function canCloseFiscalYear(role: PosRole | null | undefined): boolean {
  return role === 'owner';
}

export function roleLabel(role: PosRole): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'manager':
      return 'Manager';
    case 'cashier':
      return 'Cashier';
    case 'accountant':
      return 'Accountant';
  }
}
