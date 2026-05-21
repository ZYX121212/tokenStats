import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { showToast, showWarningToast, initToastKeyboardHandler } from '../lib/toast';

describe('toast utilities', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    describe('showToast', () => {
        it('should show toast with message', () => {
            const toastEl = document.createElement('div');
            toastEl.id = 'toast';
            document.body.appendChild(toastEl);

            showToast('Test message');

            expect(toastEl.textContent).toBe('Test message');
            expect(toastEl.classList.contains('visible')).toBe(true);
            expect(toastEl.classList.contains('warning')).toBe(false);
        });

        it('should hide toast after duration', () => {
            const toastEl = document.createElement('div');
            toastEl.id = 'toast';
            document.body.appendChild(toastEl);

            showToast('Test message');

            expect(toastEl.classList.contains('visible')).toBe(true);

            vi.advanceTimersByTime(2200);

            expect(toastEl.classList.contains('visible')).toBe(false);
        });

        it('should use custom duration when provided', () => {
            const toastEl = document.createElement('div');
            toastEl.id = 'toast';
            document.body.appendChild(toastEl);

            showToast('Test message', undefined, 5000);

            expect(toastEl.classList.contains('visible')).toBe(true);

            vi.advanceTimersByTime(4000);
            expect(toastEl.classList.contains('visible')).toBe(true);

            vi.advanceTimersByTime(1000);
            expect(toastEl.classList.contains('visible')).toBe(false);
        });

        it('should use custom element id when provided', () => {
            const customToast = document.createElement('div');
            customToast.id = 'custom-toast';
            document.body.appendChild(customToast);

            showToast('Custom message', 'custom-toast');

            expect(customToast.textContent).toBe('Custom message');
            expect(customToast.classList.contains('visible')).toBe(true);
        });

        it('should do nothing if element does not exist', () => {
            expect(() => showToast('Test message', 'non-existent')).not.toThrow();
        });

        it('should clear previous timer before showing new toast', () => {
            const toastEl = document.createElement('div');
            toastEl.id = 'toast';
            document.body.appendChild(toastEl);

            showToast('First message');
            vi.advanceTimersByTime(1000);

            showToast('Second message');

            expect(toastEl.textContent).toBe('Second message');
            expect(toastEl.classList.contains('visible')).toBe(true);

            vi.advanceTimersByTime(1000);
            expect(toastEl.classList.contains('visible')).toBe(true);

            vi.advanceTimersByTime(1200);
            expect(toastEl.classList.contains('visible')).toBe(false);
        });

        it('should remove tabindex attribute', () => {
            const toastEl = document.createElement('div');
            toastEl.id = 'toast';
            toastEl.setAttribute('tabindex', '-1');
            document.body.appendChild(toastEl);

            showToast('Test message');

            expect(toastEl.hasAttribute('tabindex')).toBe(false);
        });
    });

    describe('showWarningToast', () => {
        it('should show warning toast with message', () => {
            const toastEl = document.createElement('div');
            toastEl.id = 'toast';
            document.body.appendChild(toastEl);

            showWarningToast('Warning message');

            expect(toastEl.textContent).toBe('Warning message');
            expect(toastEl.classList.contains('visible')).toBe(true);
            expect(toastEl.classList.contains('warning')).toBe(true);
        });

        it('should hide warning toast after longer duration', () => {
            const toastEl = document.createElement('div');
            toastEl.id = 'toast';
            document.body.appendChild(toastEl);

            showWarningToast('Warning message');

            expect(toastEl.classList.contains('visible')).toBe(true);
            expect(toastEl.classList.contains('warning')).toBe(true);

            vi.advanceTimersByTime(3200);

            expect(toastEl.classList.contains('visible')).toBe(false);
            expect(toastEl.classList.contains('warning')).toBe(false);
        });

        it('should use custom element id when provided', () => {
            const customToast = document.createElement('div');
            customToast.id = 'custom-toast';
            document.body.appendChild(customToast);

            showWarningToast('Custom warning', 'custom-toast');

            expect(customToast.textContent).toBe('Custom warning');
            expect(customToast.classList.contains('visible')).toBe(true);
            expect(customToast.classList.contains('warning')).toBe(true);
        });

        it('should do nothing if element does not exist', () => {
            expect(() => showWarningToast('Test warning', 'non-existent')).not.toThrow();
        });
    });

    describe('initToastKeyboardHandler', () => {
        it('should close visible toasts when Escape is pressed', () => {
            const toast1 = document.createElement('div');
            toast1.className = 'toast-msg visible';
            document.body.appendChild(toast1);

            const toast2 = document.createElement('div');
            toast2.className = 'toast-msg visible warning';
            document.body.appendChild(toast2);

            initToastKeyboardHandler();

            const event = new KeyboardEvent('keydown', { key: 'Escape' });
            document.dispatchEvent(event);

            expect(toast1.classList.contains('visible')).toBe(false);
            expect(toast2.classList.contains('visible')).toBe(false);
            expect(toast2.classList.contains('warning')).toBe(false);
        });

        it('should not affect non-visible toasts', () => {
            const toast = document.createElement('div');
            toast.className = 'toast-msg';
            document.body.appendChild(toast);

            initToastKeyboardHandler();

            const event = new KeyboardEvent('keydown', { key: 'Escape' });
            document.dispatchEvent(event);

            expect(toast.classList.contains('visible')).toBe(false);
        });

        it('should not affect other key presses', () => {
            const toast = document.createElement('div');
            toast.className = 'toast-msg visible';
            document.body.appendChild(toast);

            initToastKeyboardHandler();

            const event = new KeyboardEvent('keydown', { key: 'Enter' });
            document.dispatchEvent(event);

            expect(toast.classList.contains('visible')).toBe(true);
        });
    });
});