export function fmt(n: string | number): string {
    const parsed = parseFloat(String(n).replace(/,/g, ''));
    const num = Math.max(0, isNaN(parsed) ? 0 : parsed);
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
    return String(Math.round(num));
}

export function esc(s: string): string {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

const MODEL_COLORS = [
    '#00d4ff', '#ffb347', '#2dd4a8', '#a78bfa',
    '#f43f5e', '#60a5fa', '#f97316', '#14b8a6',
    '#ec4899', '#84cc16', '#06b6d4', '#f59e0b',
    '#8b5cf6', '#10b981', '#ef4444', '#3b82f6',
];

export function colorForModel(model: string): string {
    if (!model) return '#71717a';
    let hash = 0;
    for (let i = 0; i < model.length; i++) {
        hash = ((hash << 5) - hash + model.charCodeAt(i)) | 0;
    }
    return MODEL_COLORS[Math.abs(hash) % MODEL_COLORS.length];
}

export function $<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}

export function truncate(s: string | null | undefined, max: number): string {
    if (s == null) return '';
    return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}

export function formatTimeAgo(date: Date | null): string {
    if (!date) return '尚未刷新';
    const diff = Date.now() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (seconds < 10) return '刚刚刷新';
    if (seconds < 60) return `${seconds} 秒前`;
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}
