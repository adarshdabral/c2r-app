// Segmentation categories for role='user'. Extend by appending a value and
// adding a route entry below; no auth/middleware change required.
// Keep in sync with backend/config/userTypes.js.
export const USER_TYPES = ['individual', 'small_business', 'bulk_producer'] as const;

export type UserType = (typeof USER_TYPES)[number];

export const DEFAULT_USER_TYPE: UserType = 'individual';

export const userTypeToRoute: Record<UserType, string> = {
  individual: '/dashboard/individual',
  small_business: '/dashboard/business',
  bulk_producer: '/dashboard/bulk',
};

// Fallback route when user_type is missing/unknown. Resolves via the
// /dashboard redirector page.
export const DEFAULT_USER_DASHBOARD = '/dashboard';

export const isUserType = (value: unknown): value is UserType =>
  typeof value === 'string' && (USER_TYPES as readonly string[]).includes(value);

export const routeForUserType = (value: unknown): string =>
  isUserType(value) ? userTypeToRoute[value] : DEFAULT_USER_DASHBOARD;

export const USER_TYPE_LABELS: Record<UserType, string> = {
  individual: 'Individual',
  small_business: 'Small Business',
  bulk_producer: 'Bulk Producer',
};
