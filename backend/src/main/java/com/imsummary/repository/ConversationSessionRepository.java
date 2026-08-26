package com.imsummary.repository;

import com.imsummary.domain.ConversationSessionEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ConversationSessionRepository extends JpaRepository<ConversationSessionEntity, String> {

    List<ConversationSessionEntity> findByTitleContainingIgnoreCaseOrderByCreatedAtDesc(String keyword);

    List<ConversationSessionEntity> findAllByOrderByCreatedAtDesc();
}
