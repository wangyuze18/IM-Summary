package com.imsummary.api;

import com.imsummary.service.ImportService;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

/** 导入接口：预检查上传 → 确认导入（支持逐文件批量调用） */
@RestController
@RequestMapping("/api/imports")
public class ImportController {

    private final ImportService importService;

    public ImportController(ImportService importService) {
        this.importService = importService;
    }

    @PostMapping("/validate")
    public Map<String, Object> validate(@RequestParam("file") MultipartFile file) throws Exception {
        return importService.validate(file.getOriginalFilename(), file.getBytes());
    }

    @PostMapping("/{importId}/confirm")
    public Map<String, Object> confirm(@PathVariable String importId) {
        return importService.confirm(importId);
    }
}
