import { create } from 'zustand';
import type { Direction } from '@printpesa/shared';

/** A trade the user tried to place but couldn't fund yet; resumed after the deposit lands. */
export interface PendingTrade { direction: Direction; stakeCents: number; }

interface DepositUiState {
  open: boolean;
  /** Amount to seed the deposit field with (cents), e.g. enough to cover an intended stake. */
  prefillAmountCents: number | null;
  /** Trade to resume once the wallet is funded. Survives closing the sheet. */
  pending: PendingTrade | null;
  openDeposit: (opts?: { amountCents?: number; pending?: PendingTrade | null }) => void;
  close: () => void;
  clearPending: () => void;
}

/** Global deposit sheet state so any surface (wallet page, bet panel) can launch it. */
export const useDepositUi = create<DepositUiState>((set) => ({
  open: false,
  prefillAmountCents: null,
  pending: null,
  openDeposit: (opts = {}) =>
    set({ open: true, prefillAmountCents: opts.amountCents ?? null, pending: opts.pending ?? null }),
  close: () => set({ open: false }),
  clearPending: () => set({ pending: null }),
}));
