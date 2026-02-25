PAGO_EXPR = """
(
  (
    TIMESTAMPDIFF(HOUR, f.fecha_inicio, f.fecha_fin)
    +
    CASE
      WHEN DATE(f.fecha_fin) <> LAST_DAY(DATE(f.fecha_fin)) THEN 24
      WHEN MONTH(f.fecha_inicio) = 2 AND DAY(f.fecha_fin) = 28 THEN 72
      WHEN MONTH(f.fecha_inicio) = 2 AND DAY(f.fecha_fin) = 29 THEN 48
      WHEN MONTH(f.fecha_inicio) = 2 THEN 48
      WHEN MONTH(f.fecha_inicio) IN (4,6,9,11) THEN 24
      ELSE 0
    END
  ) / 720
)
"""
