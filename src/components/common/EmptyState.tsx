import { createSignal, onMount } from 'solid-js';

interface EmptyStateProps {
  type?: 'default' | 'data' | 'search' | 'settings' | 'error';
  title?: string;
  description?: string;
  icon?: string;
  actionText?: string;
  onAction?: () => void;
}

export default function EmptyState(props: EmptyStateProps) {
  const [isVisible, setIsVisible] = createSignal(false);

  const getIconByType = () => {
    switch (props.type) {
      case 'data':
        return '📊';
      case 'search':
        return '🔍';
      case 'settings':
        return '⚙️';
      case 'error':
        return '⚠️';
      default:
        return props.icon || '📭';
    }
  };

  const getTitleByType = () => {
    if (props.title) return props.title;
    switch (props.type) {
      case 'data':
        return '暂无数据';
      case 'search':
        return '未找到结果';
      case 'settings':
        return '暂无配置';
      case 'error':
        return '出了点问题';
      default:
        return '这里空无一物';
    }
  };

  const getDescriptionByType = () => {
    if (props.description) return props.description;
    switch (props.type) {
      case 'data':
        return '开始使用后，您的 Token 统计数据将显示在这里';
      case 'search':
        return '尝试使用其他关键词搜索';
      case 'settings':
        return '您可以在此页面配置您的偏好设置';
      case 'error':
        return '请刷新页面或稍后再试';
      default:
        return '添加一些内容来开始吧';
    }
  };

  onMount(() => {
    setTimeout(() => setIsVisible(true), 100);
  });

  return (
    <div class={`empty-state ${isVisible() ? 'visible' : ''}`}>
      <div class="empty-state-content">
        <div class="empty-icon-container">
          <span class="empty-icon">{getIconByType()}</span>
          <div class="empty-icon-glow"></div>
        </div>
        <h3 class="empty-title">{getTitleByType()}</h3>
        <p class="empty-description">{getDescriptionByType()}</p>
        {props.onAction && props.actionText && (
          <button class="empty-action-btn" onClick={props.onAction}>
            {props.actionText}
          </button>
        )}
      </div>
    </div>
  );
}
