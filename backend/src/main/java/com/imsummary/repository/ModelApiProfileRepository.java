package com.imsummary.repository;

import com.imsummary.domain.ModelApiProfileEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ModelApiProfileRepository extends JpaRepository<ModelApiProfileEntity, String> {

    List<ModelApiProfileEntity> findAllByOrderByCreatedAtAsc();

    List<ModelApiProfileEntity> findByEnabledTrue();
}
