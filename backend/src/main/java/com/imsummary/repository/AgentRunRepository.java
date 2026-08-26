package com.imsummary.repository;

import com.imsummary.domain.AgentRunEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AgentRunRepository extends JpaRepository<AgentRunEntity, String> {

    List<AgentRunEntity> findBySessionIdOrderByStartedAtDesc(String sessionId);

    Optional<AgentRunEntity> findTopBySessionIdOrderByStartedAtDesc(String sessionId);

    void deleteBySessionId(String sessionId);
}
