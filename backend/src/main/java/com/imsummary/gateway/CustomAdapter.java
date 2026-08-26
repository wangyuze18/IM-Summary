package com.imsummary.gateway;

import org.springframework.stereotype.Component;

/**
 * 自定义协议：按 OpenAI 兼容格式处理（用户自建的 OpenAI-Compatible 服务）。
 */
@Component
public class CustomAdapter extends OpenAiCompatibleAdapter {

    public CustomAdapter(@org.springframework.beans.factory.annotation.Value("${imsummary.model-timeout-seconds:120}") int timeoutSeconds) {
        super(timeoutSeconds);
    }

    @Override
    public String providerType() {
        return "custom";
    }
}
