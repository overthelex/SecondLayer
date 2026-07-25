/**
 * uiStore Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Mock window.innerWidth before importing the store
Object.defineProperty(window, 'innerWidth', { value: 1440, writable: true });

import { useUIStore } from '../uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    useUIStore.setState({
      isSidebarOpen: true,
      isRightPanelOpen: true,
      rightPanelWidth: 400,
    });
  });

  describe('Sidebar', () => {
    it('should toggle sidebar', () => {
      expect(useUIStore.getState().isSidebarOpen).toBe(true);

      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().isSidebarOpen).toBe(false);

      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().isSidebarOpen).toBe(true);
    });

    it('should set sidebar open state directly', () => {
      useUIStore.getState().setSidebarOpen(false);
      expect(useUIStore.getState().isSidebarOpen).toBe(false);

      useUIStore.getState().setSidebarOpen(true);
      expect(useUIStore.getState().isSidebarOpen).toBe(true);
    });
  });

  describe('Right Panel', () => {
    it('should toggle right panel', () => {
      expect(useUIStore.getState().isRightPanelOpen).toBe(true);

      useUIStore.getState().toggleRightPanel();
      expect(useUIStore.getState().isRightPanelOpen).toBe(false);

      useUIStore.getState().toggleRightPanel();
      expect(useUIStore.getState().isRightPanelOpen).toBe(true);
    });

    it('should set right panel open state directly', () => {
      useUIStore.getState().setRightPanelOpen(false);
      expect(useUIStore.getState().isRightPanelOpen).toBe(false);
    });

    it('should set right panel width', () => {
      useUIStore.getState().setRightPanelWidth(500);
      expect(useUIStore.getState().rightPanelWidth).toBe(500);
    });

    it('should clamp right panel width to minimum 320', () => {
      useUIStore.getState().setRightPanelWidth(100);
      expect(useUIStore.getState().rightPanelWidth).toBe(320);
    });

    it('should clamp right panel width to maximum 800', () => {
      useUIStore.getState().setRightPanelWidth(1200);
      expect(useUIStore.getState().rightPanelWidth).toBe(800);
    });
  });
});
