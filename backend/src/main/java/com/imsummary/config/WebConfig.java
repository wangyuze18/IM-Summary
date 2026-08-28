package com.imsummary.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 跨源访问（CORS）配置 —— 后端设计文档 V5.3
 * 桌面端渲染进程直接以 fetch 调用 /api/**：
 * 开发模式 Origin 为本地 dev server，打包后为 null（file:// 加载），
 * 未开启 CORS 时浏览器会拦截响应，导致前端无法连接后端数据源。
 * Demo 级本地部署：允许任意 Origin，暴露 Content-Disposition（下载建议文件名）。
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns("*")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .exposedHeaders("Content-Disposition")
                .maxAge(3600);
    }
}
