use anyhow::Result;

use crate::domain::entity::AppSettings;

pub trait ConfigPort: Send + Sync + Clone {
    fn load(&self) -> Result<AppSettings>;
    fn save(&self, settings: &AppSettings) -> Result<()>;
}

pub trait NotificationPort: Send + Sync + Clone {
    fn warn(&self, title: &str, message: &str);
}
