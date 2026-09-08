import { useSyncExternalStore } from 'react';
import { getAuthSessionKey, subscribeAuthSession } from '../utils/authSession';

export function useAuthSession() {
    return useSyncExternalStore(subscribeAuthSession, getAuthSessionKey, () => null);
}
