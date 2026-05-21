use crate::domain::entity::TokenUsage;

/// Check if a scanned record already exists in the store.
/// Dedup key: (source, original_ts, total_tokens).
#[allow(dead_code)]
pub fn is_duplicate(
    store: &crate::infrastructure::persistence::sqlite_store::SqliteTokenStore,
    usage: &TokenUsage,
) -> bool {
    let source = match &usage.source {
        Some(s) => s.as_str(),
        None => return false,
    };
    let ts = match usage.original_ts {
        Some(t) => t,
        None => return false,
    };
    store
        .source_exists(source, ts, usage.total_tokens)
        .unwrap_or(false)
}
