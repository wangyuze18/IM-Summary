package com.imsummary.repository;

import com.imsummary.domain.AgentStepRunEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AgentStepRunRepository extends JpaRepository<AgentStepRunEntity, Long> {

    List<AgentStepRunEntity> findByRunIdOrderByStepOrderAsc(String runId);

    Optional<AgentStepRunEntity> findByRunIdAndAgentKey(String runId, String agentKey);
}
