use notify_rust::Notification;
use tracing::error;

use crate::application::port::NotificationPort;

#[derive(Clone)]
pub struct SystemNotification;

impl SystemNotification {
    pub fn new() -> Self {
        Self
    }
}

impl NotificationPort for SystemNotification {
    fn warn(&self, title: &str, message: &str) {
        if let Err(e) = Notification::new()
            .summary(title)
            .body(message)
            .icon("dialog-warning")
            .show()
        {
            error!("发送警告通知失败: {}", e);
        }
    }
}
