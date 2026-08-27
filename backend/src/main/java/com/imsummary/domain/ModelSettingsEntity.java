package com.imsummary.domain;

import jakarta.persistence.*;
import lombok.Data;

/**
 * 模型绑定设置（单行记录）：默认档案 + 单 Agent 覆盖 + 思考模式开关。
 * bindings JSON 结构：{"defaultProfileId": "...", "thinkingEnabled": true,
 *   "overrides": {"summary": "profileId", ...}}
 */
@Data
@Entity
@Table(name = "model_settings")
public class ModelSettingsEntity {

    @Id
    private String settingsId;

    @Column(columnDefinition = "CLOB")
    private String bindingsJson;
}
