import { create } from 'zustand';

interface UiState {
  borderRadius: number;
  padding: number;
  gap: number;
  itemSize: number;
}

interface Store {
  ui: UiState;
  updateUi: (updates: Partial<UiState>) => void;
}

export const useStore = create<Store>((set) => ({
  ui: {
    borderRadius: 8,
    padding: 16,
    gap: 16,
    itemSize: 100,
  },
  updateUi: (updates) =>
    set((state) => ({
      ui: { ...state.ui, ...updates },
    })),
}));
