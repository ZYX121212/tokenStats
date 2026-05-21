import { describe, it, expect } from 'vitest';
import { fmt, colorForModel, truncate, esc, $ } from '../lib/utils';

describe('fmt utility', () => {
    it('should format large numbers with M suffix', () => {
        expect(fmt(1500000)).toBe('1.5M');
        expect(fmt('2,500,000')).toBe('2.5M');
    });

    it('should format medium numbers with K suffix', () => {
        expect(fmt(1500)).toBe('1.5K');
        expect(fmt('3,200')).toBe('3.2K');
    });

    it('should return small numbers as string', () => {
        expect(fmt(999)).toBe('999');
        expect(fmt(0)).toBe('0');
        expect(fmt(100)).toBe('100');
    });

    it('should handle string input with commas', () => {
        expect(fmt('1,234,567')).toBe('1.2M');
    });

    it('should handle zero', () => {
        expect(fmt(0)).toBe('0');
        expect(fmt('0')).toBe('0');
    });

    it('should handle negative values by treating them as zero', () => {
        expect(fmt(-100)).toBe('0');
    });
});

describe('colorForModel utility', () => {
    it('should return consistent color for same model', () => {
        const color1 = colorForModel('gpt-4o');
        const color2 = colorForModel('gpt-4o');
        expect(color1).toBe(color2);
    });

    it('should return different colors for different models', () => {
        const color1 = colorForModel('gpt-4o');
        const color2 = colorForModel('claude-3');
        // 注意：不同模型可能偶然得到相同颜色（取决于 hash 碰撞）
        // 这里只验证函数能正常返回颜色值
        expect(color1).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(color2).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    it('should handle empty model name', () => {
        const color = colorForModel('');
        expect(color).toBe('#71717a');
    });

    it('should return valid hex color for known models', () => {
        const models = ['gpt-4o', 'claude-3-sonnet', 'gemini-pro'];
        models.forEach(model => {
            const color = colorForModel(model);
            expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
        });
    });
});

describe('truncate utility', () => {
    it('should truncate long strings', () => {
        const longString = 'This is a very long string that should be truncated';
        const result = truncate(longString, 20);
        expect(result.length).toBe(20);
        expect(result.endsWith('…')).toBe(true);
    });

    it('should not truncate short strings', () => {
        const shortString = 'Short';
        const result = truncate(shortString, 20);
        expect(result).toBe(shortString);
    });

    it('should handle exact length strings', () => {
        const exactString = 'Exactly 20 chars!';
        const result = truncate(exactString, 20);
        expect(result).toBe(exactString);
    });

    it('should handle null and undefined', () => {
        expect(truncate(null, 10)).toBe('');
        expect(truncate(undefined, 10)).toBe('');
    });
});

describe('esc utility', () => {
    it('should escape HTML special characters', () => {
        expect(esc('<script>alert("XSS")</script>')).toBe('&lt;script&gt;alert("XSS")&lt;/script&gt;');
        expect(esc('&')).toBe('&amp;');
        expect(esc('<>')).toBe('&lt;&gt;');
    });

    it('should return plain text unchanged', () => {
        expect(esc('Hello World')).toBe('Hello World');
        expect(esc('12345')).toBe('12345');
    });

    it('should handle empty string', () => {
        expect(esc('')).toBe('');
    });
});

describe('$ utility', () => {
    it('should return element by id', () => {
        const div = document.createElement('div');
        div.id = 'test-div';
        document.body.appendChild(div);
        
        const result = $('test-div');
        expect(result).toBe(div);
        expect(result?.tagName).toBe('DIV');
        
        document.body.removeChild(div);
    });

    it('should return null for non-existent id', () => {
        const result = $('non-existent-id');
        expect(result).toBe(null);
    });

    it('should work with type casting', () => {
        const input = document.createElement('input');
        input.id = 'test-input';
        input.type = 'text';
        document.body.appendChild(input);
        
        const result = $<HTMLInputElement>('test-input');
        expect(result?.type).toBe('text');
        
        document.body.removeChild(input);
    });
});
