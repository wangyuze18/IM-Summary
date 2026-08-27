package com.imsummary.api;

import com.imsummary.service.ModelProfileService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 模型配置接口：档案 CRUD、测试连接（支持未保存草稿）、Agent 绑定。
 * 所有响应中 API Key 仅以掩码出现。
 */
@RestController
@RequestMapping("/api/model-profiles")
public class ModelProfileController {

    private final ModelProfileService profileService;

    public ModelProfileController(ModelProfileService profileService) {
        this.profileService = profileService;
    }

    @GetMapping
    public List<Map<String, Object>> list() {
        return profileService.listProfiles();
    }

    /** 新增/更新档案：apiKey 为空表示沿用已保存凭据 */
    @PostMapping
    public Map<String, Object> save(@RequestBody Map<String, Object> body) {
        return profileService.saveProfile(
                (String) body.get("profileId"),
                (String) body.get("displayName"),
                (String) body.get("providerType"),
                (String) body.get("baseUrl"),
                (String) body.get("modelName"),
                (String) body.get("apiKey"),
                (Boolean) body.get("enabled"));
    }

    @DeleteMapping("/{profileId}")
    public Map<String, Object> delete(@PathVariable String profileId) {
        profileService.deleteProfile(profileId);
        return Map.of("deleted", true);
    }

    /**
     * 测试连接：
     * - 携带 profileId：测试已保存档案（可选携带新 apiKey）
     * - 不携带 profileId：测试未保存的草稿配置
     */
    @PostMapping("/test")
    public Map<String, Object> test(@RequestBody Map<String, Object> body) {
        return profileService.testProfile(
                (String) body.get("profileId"),
                (String) body.get("providerType"),
                (String) body.get("baseUrl"),
                (String) body.get("apiKey"),
                (String) body.get("modelName"));
    }

    // ---------- Agent 绑定 ----------

    @GetMapping("/bindings")
    public Map<String, Object> getBindings() {
        return profileService.getBindings();
    }

    @PutMapping("/bindings")
    @SuppressWarnings("unchecked")
    public Map<String, Object> saveBindings(@RequestBody Map<String, Object> body) {
        profileService.saveBindings(
                (String) body.get("defaultProfileId"),
                Boolean.TRUE.equals(body.get("thinkingEnabled")),
                (Map<String, String>) body.get("overrides"));
        return profileService.getBindings();
    }
}
