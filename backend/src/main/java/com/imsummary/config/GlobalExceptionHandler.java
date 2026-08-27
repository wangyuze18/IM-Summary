package com.imsummary.config;

import com.imsummary.gateway.ModelCallException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * 全局异常映射：统一错误码 + 用户可读消息，不泄露敏感细节。
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<Map<String, Object>> notFound(NoSuchElementException e) {
        return error(HttpStatus.NOT_FOUND, "NOT_FOUND", e.getMessage());
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, Object>> conflict(IllegalStateException e) {
        String msg = e.getMessage() == null ? "状态冲突" : e.getMessage();
        HttpStatus status = msg.startsWith("NOT_EVALUABLE") ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST;
        String code = msg.startsWith("NOT_EVALUABLE") ? "NOT_EVALUABLE" : "INVALID_STATE";
        return error(status, code, msg);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> badRequest(IllegalArgumentException e) {
        return error(HttpStatus.BAD_REQUEST, "INVALID_ARGUMENT", e.getMessage());
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, Object>> tooLarge(MaxUploadSizeExceededException e) {
        return error(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE", "上传文件超出大小限制");
    }

    @ExceptionHandler(ModelCallException.class)
    public ResponseEntity<Map<String, Object>> modelCallFailed(ModelCallException e) {
        return error(HttpStatus.BAD_GATEWAY, "MODEL_CALL_FAILED", e.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> internal(Exception e) {
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务内部错误，请稍后重试");
    }

    private ResponseEntity<Map<String, Object>> error(HttpStatus status, String code, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("errorCode", code);
        body.put("message", message);
        return ResponseEntity.status(status).body(body);
    }
}
