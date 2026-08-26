package com.imsummary.api;

import com.imsummary.domain.SummaryResultEntity;
import com.imsummary.repository.SummaryResultRepository;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.*;

/** 摘要接口：当前摘要、历史版本、Markdown/JSON 导出 */
@RestController
public class SummaryController {

    private final SummaryResultRepository summaryRepository;

    public SummaryController(SummaryResultRepository summaryRepository) {
        this.summaryRepository = summaryRepository;
    }

    /** 当前摘要：默认最新；?mode= 过滤模式；?version= 取指定版本 */
    @GetMapping("/api/sessions/{sessionId}/summary")
    public Map<String, Object> current(@PathVariable String sessionId,
                                       @RequestParam(required = false) String mode,
                                       @RequestParam(required = false) Integer version) {
        List<SummaryResultEntity> list = mode == null
                ? summaryRepository.findBySessionIdOrderByVersionDesc(sessionId)
                : summaryRepository.findBySessionIdAndModeOrderByVersionDesc(sessionId, mode);
        SummaryResultEntity summary = version == null
                ? list.stream().findFirst().orElseThrow(() -> new NoSuchElementException("该会话尚无摘要"))
                : list.stream().filter(s -> s.getVersion() == version).findFirst()
                        .orElseThrow(() -> new NoSuchElementException("摘要版本不存在：v" + version));
        return toView(summary);
    }

    @GetMapping("/api/sessions/{sessionId}/summaries")
    public List<Map<String, Object>> history(@PathVariable String sessionId,
                                             @RequestParam(required = false) String mode) {
        List<SummaryResultEntity> list = mode == null
                ? summaryRepository.findBySessionIdOrderByVersionDesc(sessionId)
                : summaryRepository.findBySessionIdAndModeOrderByVersionDesc(sessionId, mode);
        return list.stream().map(s -> {
            Map<String, Object> m = toView(s);
            m.remove("markdown"); // 列表不返回全文
            m.remove("structured");
            return m;
        }).toList();
    }

    /** 导出：?type=markdown|json */
    @GetMapping("/api/summaries/{summaryId}/export")
    public ResponseEntity<byte[]> export(@PathVariable String summaryId,
                                         @RequestParam(defaultValue = "markdown") String type) {
        SummaryResultEntity summary = summaryRepository.findById(summaryId)
                .orElseThrow(() -> new NoSuchElementException("摘要不存在：" + summaryId));
        String content = "json".equals(type) ? summary.getStructuredJson() : summary.getMarkdown();
        String ext = "json".equals(type) ? "json" : "md";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"summary-v" + summary.getVersion() + "." + ext + "\"")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(content == null ? new byte[0] : content.getBytes(StandardCharsets.UTF_8));
    }

    private Map<String, Object> toView(SummaryResultEntity s) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("summaryId", s.getSummaryId());
        view.put("sessionId", s.getSessionId());
        view.put("runId", s.getRunId());
        view.put("version", s.getVersion());
        view.put("mode", s.getMode());
        view.put("markdown", s.getMarkdown());
        view.put("structured", s.getStructuredJson());
        view.put("evidenceLinks", s.getEvidenceLinksJson());
        view.put("auditStatus", s.getAuditStatus());
        view.put("generatedAt", s.getGeneratedAt());
        return view;
    }
}
