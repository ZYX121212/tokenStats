use std::fs;
use std::path::PathBuf;

use anyhow::Result;

use crate::application::port::ConfigPort;
use crate::domain::entity::AppSettings;

#[derive(Clone)]
pub struct FileConfigProvider {
    config_path: String,
}

impl FileConfigProvider {
    pub fn new(config_path: &str) -> Self {
        Self {
            config_path: config_path.to_string(),
        }
    }

    pub fn default_path() -> Result<PathBuf> {
        let dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".tokenstats");

        if !dir.exists() {
            fs::create_dir_all(&dir)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&dir, fs::Permissions::from_mode(0o700))?;
            }
        }

        Ok(dir.join("config.json"))
    }

    pub fn default_db_path() -> Result<PathBuf> {
        let dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".tokenstats");

        if !dir.exists() {
            fs::create_dir_all(&dir)?;
        }

        Ok(dir.join("tokenstats.db"))
    }
}

impl ConfigPort for FileConfigProvider {
    fn load(&self) -> Result<AppSettings> {
        let path = PathBuf::from(&self.config_path);
        if path.exists() {
            let content = fs::read_to_string(&path)?;

            match serde_json::from_str::<AppSettings>(&content) {
                Ok(mut settings) => {
                    if settings.config_version < CURRENT_CONFIG_VERSION {
                        tracing::info!(
                            "检测到旧版配置 v{}，正在迁移到 v{}",
                            settings.config_version,
                            CURRENT_CONFIG_VERSION
                        );
                        settings = migrate_config(settings)?;
                        self.save(&settings)?;
                    }
                    Ok(settings)
                }
                Err(e) => {
                    tracing::warn!("配置文件格式异常，尝试兼容加载: {}", e);

                    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
                        let default = AppSettings::default();
                        let merged = merge_config(default, value)?;
                        tracing::info!("使用兼容模式加载配置（部分字段使用了默认值）");
                        self.save(&merged)?;
                        return Ok(merged);
                    }

                    tracing::error!("配置文件严重损坏，将重置为默认配置");
                    let settings = AppSettings::default();
                    self.save(&settings)?;
                    Ok(settings)
                }
            }
        } else {
            let settings = AppSettings::default();
            self.save(&settings)?;
            Ok(settings)
        }
    }

    fn save(&self, settings: &AppSettings) -> Result<()> {
        let path = PathBuf::from(&self.config_path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let content = serde_json::to_string_pretty(settings)?;
        fs::write(&path, content)?;
        secure_file(&path)?;
        Ok(())
    }
}

fn secure_file(path: &PathBuf) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}

fn merge_config(default: AppSettings, value: serde_json::Value) -> Result<AppSettings> {
    let default_value = serde_json::to_value(&default)?;
    let merged = deep_merge(default_value, value);
    Ok(serde_json::from_value(merged)?)
}

fn deep_merge(base: serde_json::Value, override_: serde_json::Value) -> serde_json::Value {
    match (base, override_) {
        (serde_json::Value::Object(mut base_map), serde_json::Value::Object(override_map)) => {
            for (k, v) in override_map {
                base_map
                    .entry(k)
                    .and_modify(|existing| *existing = deep_merge(existing.clone(), v.clone()))
                    .or_insert(v);
            }
            serde_json::Value::Object(base_map)
        }
        (_, override_) => override_,
    }
}

const CURRENT_CONFIG_VERSION: u32 = 1;

fn migrate_config(settings: AppSettings) -> Result<AppSettings> {
    let mut s = settings;
    s.config_version = CURRENT_CONFIG_VERSION;
    Ok(s)
}
