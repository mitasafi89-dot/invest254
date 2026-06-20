import { create } from 'zustand';
import type { Direction } from '@invest254/shared';

export type WalletMode = 'deposit' | 'withdraw';

/** A trade the user tried to place but couldn't fund yet; resumed after the deposit lands. */
export interface PendingTrade { direction: Direction; stakeCents: number; }

interface WalletUiState {
  open: boolean;
  /** Which side of the wallet sheet is showing. */
  mode: WalletMode;
  /** Amount to seed the deposit field with (cents), e.g. enough to cover an intended stake. */
  prefillAmountCents: number | null;
  /** Trade to resume once the wallet is funded. Survives closing the sheet. */
  pending: PendingTrade | null;
  /** Open on the Deposit tab (optionally seeded to fund a specific trade). */
  openDeposit: (opts?: { amountCents?: number; pending?: PendingTrade | null }) => void;
  /** Open on the Withdraw tab. */
  openWithdraw: () => void;
  /** Switch tabs while the sheet stays open. */
  setMode: (mode: WalletMode) => void;
  close: () => void;
  clearPending: () => void;
}

/**
 * Global wallet-sheet state. Any surface (top-bar balance, wallet page, bet panel) can open
 * the unified Deposit/Withdraw modal and choose which tab to land on. The store keeps the
 * legacy `useDepositUi` name + `openDeposit` signature so existing callers keep working.
 */
export const useDepositUi = create<WalletUiState>((set) => ({
  open: false,
  mode: 'deposit',
  prefillAmountCents: null,
  pending: null,
  openDeposit: (opts = {}) =>
    set({ open: true, mode: 'deposit', prefillAmountCents: opts.amountCents ?? null, pending: opts.pending ?? null }),
  openWithdraw: () => set({ open: true, mode: 'withdraw', prefillAmountCents: null }),
  setMode: (mode) => set({ mode }),
  close: () => set({ open: false }),
  clearPending: () => set({ pending: null }),
}));
