import { createStore } from 'solid-js/store';
import type { FloatingData } from '../types';

export interface FloatingState {
  data: FloatingData | null;
  isLoading: boolean;
  opacity: number;
  menuOpen: boolean;
  menuPos: { x: number; y: number };
  providers: string[];
  mockMode: boolean;
  chartExpanded: boolean;
}

export const [state, setState] = createStore<FloatingState>({
  data: null,
  isLoading: false,
  opacity: 0.48,
  menuOpen: false,
  menuPos: { x: 0, y: 0 },
  providers: [],
  mockMode: false,
  chartExpanded: false,
});

export function updateFloatingData(data: FloatingData) {
  setState('data', data);
}

export function setOpacity(value: number) {
  setState('opacity', value);
}

export function openMenu(x: number, y: number) {
  setState({ menuOpen: true, menuPos: { x, y } });
}

export function closeMenu() {
  setState('menuOpen', false);
}

export function setProviders(providers: string[]) {
  setState('providers', providers);
}

export function setMockMode(enabled: boolean) {
  setState('mockMode', enabled);
}

export function toggleChartExpanded() {
  setState('chartExpanded', !state.chartExpanded);
}
