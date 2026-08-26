package com.imsummary.gateway;

/**
 * 模型调用异常：携带 HTTP 状态码与标准化错误信息（不含密钥）。
 */
public class ModelCallException extends RuntimeException {

    private final int httpStatus;

    public ModelCallException(int httpStatus, String message) {
        super(message);
        this.httpStatus = httpStatus;
    }

    public ModelCallException(String message, Throwable cause) {
        super(message, cause);
        this.httpStatus = 0;
    }

    public int getHttpStatus() {
        return httpStatus;
    }

    /** 网络/限流类错误可重试；鉴权/参数类错误不可重试 */
    public boolean isRetryable() {
        return httpStatus == 0 || httpStatus == 408 || httpStatus == 429 || httpStatus >= 500;
    }
}
