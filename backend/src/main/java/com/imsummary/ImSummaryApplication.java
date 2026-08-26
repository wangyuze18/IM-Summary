package com.imsummary;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class ImSummaryApplication {

    public static void main(String[] args) {
        SpringApplication.run(ImSummaryApplication.class, args);
    }
}
