import { describe, it, expect } from 'vitest';
import { createSmartPolling } from '../lib/polling';

describe('createSmartPolling', () => {
    it('should create a polling handle with start, stop, and reset methods', () => {
        const handle = createSmartPolling(
            {
                fastInterval: 1000,
                slowInterval: 5000,
                idleInterval: 30000,
                noChangeThreshold: 3,
            },
            { onPoll: async () => true }
        );

        expect(typeof handle.start).toBe('function');
        expect(typeof handle.stop).toBe('function');
        expect(typeof handle.reset).toBe('function');
    });

    it('should start and stop polling', () => {
        const onPoll = async () => true;

        const handle = createSmartPolling(
            {
                fastInterval: 1000,
                slowInterval: 5000,
                idleInterval: 30000,
                noChangeThreshold: 3,
            },
            { onPoll }
        );

        handle.start();
        handle.stop();
    });

    it('should reset polling state', () => {
        const onPoll = async () => true;

        const handle = createSmartPolling(
            {
                fastInterval: 1000,
                slowInterval: 5000,
                idleInterval: 30000,
                noChangeThreshold: 3,
            },
            { onPoll }
        );

        handle.start();
        handle.reset();
        handle.start();
        handle.stop();
    });

    it('should accept onVisibilityChange callback', () => {
        const onPoll = async () => true;
        const onVisibilityChange = (hidden: boolean) => {};

        const handle = createSmartPolling(
            {
                fastInterval: 1000,
                slowInterval: 5000,
                idleInterval: 30000,
                noChangeThreshold: 3,
            },
            { onPoll, onVisibilityChange }
        );

        expect(typeof handle.start).toBe('function');
        expect(typeof handle.stop).toBe('function');
        expect(typeof handle.reset).toBe('function');
    });
});