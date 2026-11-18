import { ApiError } from './api';

/**
 * A 404/401 on a private order endpoint means the order (or its wallet) is
 * gone for good: clear the local order cookie and send the visitor back to the
 * catalogue instead of meta-refreshing a status that will never exist.
 */
export function isDeadOrderError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 401);
}
