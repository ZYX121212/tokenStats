use anyhow::Result;

use crate::domain::entity::{HourlyStat, ModelSummary, RequestLog, StatsSnapshot, TokenUsage};

/// Token 数据仓库抽象
///
/// 定义了 Token 使用数据的持久化操作接口，
/// 包括记录、查询、统计和导出等功能。
pub trait TokenRepository: Send + Sync + Clone {
    /// 记录一条 Token 使用事件
    fn record(&self, usage: &TokenUsage) -> Result<()>;
    /// 获取当前统计快照（5分钟/总计/今日）
    fn snapshot(&self) -> Result<StatsSnapshot>;
    /// 获取模型使用量汇总
    fn model_usage_summary(&self, since_ts: Option<f64>) -> Result<Vec<ModelSummary>>;
    /// 获取按小时统计
    fn hourly_stats(&self, since_ts: Option<f64>) -> Result<Vec<HourlyStat>>;
    /// 获取所有 provider 列表
    fn providers(&self) -> Result<Vec<String>>;
    /// 清空所有数据
    fn clear(&self) -> Result<()>;
    /// 清理指定天数前的旧数据
    fn clear_old_data(&self, days: u32) -> Result<u64>;
    /// 导出数据到 CSV
    fn export_to_csv(&self, path: &str) -> Result<u64>;
    /// 获取请求日志（分页）
    fn request_logs(&self, limit: u32, offset: u32) -> Result<Vec<RequestLog>>;
    /// 获取当月使用量
    fn monthly_usage(&self) -> Result<u64>;
    /// 获取来源分布统计
    fn source_summary(&self) -> Result<Vec<crate::domain::entity::SourceSummary>>;
    /// 设置统计口径（过滤特定的 token 来源）
    fn set_counting_mode(&self, _mode: &str) {}
}
