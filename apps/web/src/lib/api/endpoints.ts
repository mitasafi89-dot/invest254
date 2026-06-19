import { apiFetch } from '@/lib/api/client';
import type { GameConfigDto, MeDto, WalletDto } from '@/lib/api/types';

/**
 * Endpoint skeleton. One typed function per route; filled out per phase.
 * FE0 ships the public reads used to bootstrap the shell.
 */
export const api = {
  health: () => apiFetch<{ status: string; time: string }>('/health'),
  gameConfig: () => apiFetch<GameConfigDto>('/game/config'),
  // Authenticated reads (wired into UI in FE1+).
  me: (token: string) => apiFetch<MeDto>('/auth/me', { token }),
  wallet: (token: string) => apiFetch<WalletDto>('/wallet', { token }),
};
