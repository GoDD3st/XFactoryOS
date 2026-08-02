-- ============================================================================
-- Atomic Workstation Reservation Function (Race-Condition & Double-Booking Proof)
-- Uses SELECT ... FOR UPDATE row-level locking on workstations table
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reserve_workstation(
  p_workstation_id UUID,
  p_user_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_purpose TEXT DEFAULT 'Session travail',
  p_status TEXT DEFAULT 'CONFIRMED',
  p_requires_approval BOOLEAN DEFAULT FALSE
) RETURNS TABLE (
  reservation_id UUID,
  created_status TEXT,
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_reservation_id UUID;
  v_workstation_exists BOOLEAN;
  v_conflict_count INTEGER;
BEGIN
  -- 1. Row-level lock on the target workstation to serialize concurrent requests
  SELECT EXISTS(
    SELECT 1 FROM public.workstations 
    WHERE id = p_workstation_id 
    FOR UPDATE
  ) INTO v_workstation_exists;

  IF NOT v_workstation_exists THEN
    RETURN QUERY SELECT 
      NULL::UUID, 
      'REJECTED'::TEXT, 
      FALSE, 
      'Poste de travail non trouvé'::TEXT;
    RETURN;
  END IF;

  -- 2. Atomic overlap check using PostgreSQL tstzrange intersection (&&)
  SELECT COUNT(*) INTO v_conflict_count
  FROM public.reservations
  WHERE workstation_id = p_workstation_id
    AND status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
    AND tstzrange(start_at, end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)');

  IF v_conflict_count > 0 THEN
    RETURN QUERY SELECT 
      NULL::UUID, 
      'CONFLICT'::TEXT, 
      FALSE, 
      'Conflit détecté : Ce poste est déjà réservé sur ce créneau horaire'::TEXT;
    RETURN;
  END IF;

  -- 3. Insert reservation atomically
  INSERT INTO public.reservations (
    workstation_id,
    user_id,
    type,
    start_at,
    end_at,
    status,
    requires_approval,
    purpose,
    check_in_deadline
  ) VALUES (
    p_workstation_id,
    p_user_id,
    'STANDARD'::reservation_type,
    p_start_at,
    p_end_at,
    p_status::reservation_status,
    p_requires_approval,
    p_purpose,
    p_start_at + INTERVAL '30 minutes'
  )
  RETURNING id INTO v_reservation_id;

  RETURN QUERY SELECT 
    v_reservation_id, 
    p_status, 
    TRUE, 
    'Réservation créée avec succès'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
