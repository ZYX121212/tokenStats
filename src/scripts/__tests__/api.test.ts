import { describe, it, expect, vi } from 'vitest';

describe('api utilities', () => {
    it('should export all expected API functions', async () => {
        const api = await import('../lib/api');
        
        expect(typeof api.getStats).toBe('function');
        expect(typeof api.getModels).toBe('function');
        expect(typeof api.getModelsSince).toBe('function');
        expect(typeof api.getSettings).toBe('function');
        expect(typeof api.saveSettings).toBe('function');
        expect(typeof api.clearAllData).toBe('function');
        expect(typeof api.cleanupOldData).toBe('function');
        expect(typeof api.exportCsv).toBe('function');
        expect(typeof api.getHourlyStats).toBe('function');
        expect(typeof api.getProviders).toBe('function');
        expect(typeof api.showMainWindow).toBe('function');
        expect(typeof api.getDiagnostics).toBe('function');
        expect(typeof api.checkDbIntegrity).toBe('function');
        expect(typeof api.isPreviewMode).toBe('function');
    });

    it('getStats should return preview data when Tauri is unavailable in dev', async () => {
        const originalWindow = window;
        (window as unknown) = {};

        const api = await import('../lib/api');
        await expect(api.getStats()).resolves.toMatchObject({
            today_tokens: expect.any(Number),
            current_model: expect.any(String),
        });

        (window as unknown) = originalWindow;
    });
});
