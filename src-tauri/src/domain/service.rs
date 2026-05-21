#[derive(Clone)]
pub struct PricingService;

impl PricingService {
    pub fn new() -> Self {
        Self
    }

    pub fn normalize_model_name(&self, model: &str) -> String {
        if model.is_empty() {
            return String::new();
        }

        let model = if let Some(after_colon) = model.split_once(':') {
            after_colon.1.to_string()
        } else if let Some(after_at) = model.split_once('@') {
            after_at.1.to_string()
        } else {
            model.to_string()
        };

        match model.as_str() {
            "gpt-4" | "gpt-4-turbo" => "gpt-4".to_string(),
            "gpt-4o" | "gpt-4o-mini" => model,
            "gpt-3.5-turbo" | "gpt-3.5-turbo-0125" => "gpt-3.5-turbo".to_string(),
            "claude-3-opus" | "claude-3-opus-20240229" => "claude-3-opus".to_string(),
            "claude-3-sonnet" | "claude-3-sonnet-20240229" => "claude-3-sonnet".to_string(),
            "claude-3-haiku" | "claude-3-haiku-20240307" => "claude-3-haiku".to_string(),
            "deepseek-chat" | "deepseek-coder" => model,
            _ => model,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_basic_models() {
        let service = PricingService::new();

        assert_eq!(service.normalize_model_name("gpt-4"), "gpt-4");
        assert_eq!(service.normalize_model_name("gpt-4-turbo"), "gpt-4");
        assert_eq!(service.normalize_model_name("gpt-4o"), "gpt-4o");
        assert_eq!(service.normalize_model_name("gpt-4o-mini"), "gpt-4o-mini");
        assert_eq!(
            service.normalize_model_name("gpt-3.5-turbo"),
            "gpt-3.5-turbo"
        );
        assert_eq!(
            service.normalize_model_name("gpt-3.5-turbo-0125"),
            "gpt-3.5-turbo"
        );
    }

    #[test]
    fn test_normalize_claude_models() {
        let service = PricingService::new();

        assert_eq!(
            service.normalize_model_name("claude-3-opus"),
            "claude-3-opus"
        );
        assert_eq!(
            service.normalize_model_name("claude-3-opus-20240229"),
            "claude-3-opus"
        );
        assert_eq!(
            service.normalize_model_name("claude-3-sonnet"),
            "claude-3-sonnet"
        );
        assert_eq!(
            service.normalize_model_name("claude-3-sonnet-20240229"),
            "claude-3-sonnet"
        );
        assert_eq!(
            service.normalize_model_name("claude-3-haiku"),
            "claude-3-haiku"
        );
        assert_eq!(
            service.normalize_model_name("claude-3-haiku-20240307"),
            "claude-3-haiku"
        );
    }

    #[test]
    fn test_normalize_deepseek_models() {
        let service = PricingService::new();

        assert_eq!(
            service.normalize_model_name("deepseek-chat"),
            "deepseek-chat"
        );
        assert_eq!(
            service.normalize_model_name("deepseek-coder"),
            "deepseek-coder"
        );
    }

    #[test]
    fn test_normalize_unknown_models() {
        let service = PricingService::new();

        assert_eq!(
            service.normalize_model_name("unknown-model"),
            "unknown-model"
        );
        assert_eq!(
            service.normalize_model_name("custom-llm-v1"),
            "custom-llm-v1"
        );
    }

    #[test]
    fn test_normalize_empty_string() {
        let service = PricingService::new();

        let result = service.normalize_model_name("");
        assert!(result.is_empty(), "空字符串应返回空字符串");
    }

    #[test]
    fn test_normalize_with_colon_prefix() {
        let service = PricingService::new();

        assert_eq!(
            service.normalize_model_name("openai:gpt-4"),
            "gpt-4",
            "应去除冒号前缀"
        );
        assert_eq!(
            service.normalize_model_name("provider:gpt-4-turbo"),
            "gpt-4",
            "应去除冒号前缀并标准化"
        );
    }

    #[test]
    fn test_normalize_with_at_prefix() {
        let service = PricingService::new();

        assert_eq!(
            service.normalize_model_name("anthropic@claude-3-opus"),
            "claude-3-opus",
            "应去除 @ 前缀"
        );
        assert_eq!(
            service.normalize_model_name("vendor@deepseek-chat"),
            "deepseek-chat",
            "应去除 @ 前缀"
        );
    }

    #[test]
    fn test_normalize_with_both_prefixes() {
        let service = PricingService::new();

        assert_eq!(
            service.normalize_model_name("openai:gpt-4@latest"),
            "gpt-4@latest",
            "只去除第一个分隔符前的内容"
        );
    }

    #[test]
    fn test_normalize_long_model_name() {
        let service = PricingService::new();

        let long_name = "a".repeat(1000);
        let result = service.normalize_model_name(&long_name);
        assert_eq!(result, long_name, "超长名称应原样返回");
    }

    #[test]
    fn test_normalize_special_characters() {
        let service = PricingService::new();

        assert_eq!(
            service.normalize_model_name("gpt-4/test"),
            "gpt-4/test",
            "特殊字符应保留"
        );
        assert_eq!(
            service.normalize_model_name("model-with-dashes_and_underscores"),
            "model-with-dashes_and_underscores",
            "连字符和下划线应保留"
        );
    }

    #[test]
    fn test_normalize_whitespace() {
        let service = PricingService::new();

        assert_eq!(
            service.normalize_model_name("  gpt-4  "),
            "  gpt-4  ",
            "空白字符未被修剪（当前行为）"
        );
    }

    #[test]
    fn test_new_pricing_service() {
        let service = PricingService::new();
        let _service_clone = service.clone();
    }

    #[test]
    fn test_normalize_case_sensitivity() {
        let service = PricingService::new();

        assert_eq!(
            service.normalize_model_name("GPT-4"),
            "GPT-4",
            "大小写敏感（当前行为）：大写不会匹配"
        );
        assert_ne!(
            service.normalize_model_name("GPT-4"),
            "gpt-4",
            "大小写敏感：GPT-4 不等于 gpt-4"
        );
    }
}
