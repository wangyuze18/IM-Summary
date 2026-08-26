package com.imsummary.repository;

import com.imsummary.domain.SummaryResultEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SummaryResultRepository extends JpaRepository<SummaryResultEntity, String> {

    List<SummaryResultEntity> findBySessionIdOrderByVersionDesc(String sessionId);

    List<SummaryResultEntity> findBySessionIdAndModeOrderByVersionDesc(String sessionId, String mode);

    void deleteBySessionId(String sessionId);
}
