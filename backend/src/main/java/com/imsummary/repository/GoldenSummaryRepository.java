package com.imsummary.repository;

import com.imsummary.domain.GoldenSummaryEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface GoldenSummaryRepository extends JpaRepository<GoldenSummaryEntity, Long> {

    Optional<GoldenSummaryEntity> findTopBySessionIdOrderByGoldenVersionDesc(String sessionId);
}
