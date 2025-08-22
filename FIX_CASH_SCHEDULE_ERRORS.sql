
-- SCRIPTS PARA CORREGIR ERRORES DE CASH SCHEDULE
-- Ejecutar estos comandos en orden en la consola de Neon

-- 1. CREAR TABLA FALTANTE cash_schedule_operations_log
CREATE TABLE IF NOT EXISTS cash_schedule_operations_log (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'auto_open', 'auto_close', 'manual_open', 'manual_close'
  scheduled_time TIMESTAMP,
  executed_time TIMESTAMP DEFAULT NOW(),
  status TEXT DEFAULT 'success', -- 'success', 'failed', 'skipped'
  period_name TEXT,
  error_message TEXT,
  notes TEXT,
  cash_register_id INTEGER REFERENCES cash_register(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. CREAR ÍNDICES PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_cash_schedule_operations_log_client_id ON cash_schedule_operations_log(client_id);
CREATE INDEX IF NOT EXISTS idx_cash_schedule_operations_log_type ON cash_schedule_operations_log(type);
CREATE INDEX IF NOT EXISTS idx_cash_schedule_operations_log_executed_time ON cash_schedule_operations_log(executed_time);

-- 3. VERIFICAR QUE LAS TABLAS PRINCIPALES EXISTEN
CREATE TABLE IF NOT EXISTS cash_schedule_periods (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 1 AND day_of_week <= 7),
  period_name VARCHAR(100) DEFAULT 'Horario Principal',
  open_hour INTEGER NOT NULL CHECK (open_hour >= 0 AND open_hour <= 23),
  open_minute INTEGER NOT NULL CHECK (open_minute >= 0 AND open_minute <= 59),
  close_hour INTEGER NOT NULL CHECK (close_hour >= 0 AND close_hour <= 23),
  close_minute INTEGER NOT NULL CHECK (close_minute >= 0 AND close_minute <= 59),
  auto_open_enabled BOOLEAN DEFAULT true,
  auto_close_enabled BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  priority_order INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cash_schedule_client_config (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  timezone VARCHAR(100) DEFAULT 'America/Argentina/Buenos_Aires',
  auto_schedule_enabled BOOLEAN DEFAULT true,
  notification_enabled BOOLEAN DEFAULT false,
  notification_minutes_before INTEGER DEFAULT 5,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(client_id)
);

-- 4. CREAR ÍNDICES ADICIONALES SI NO EXISTEN
CREATE INDEX IF NOT EXISTS idx_cash_schedule_periods_client_day ON cash_schedule_periods(client_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_cash_schedule_periods_client_active ON cash_schedule_periods(client_id, is_active);
CREATE INDEX IF NOT EXISTS idx_cash_schedule_client_config_client ON cash_schedule_client_config(client_id);

-- 5. COMENTARIOS PARA DOCUMENTACIÓN
COMMENT ON TABLE cash_schedule_operations_log IS 'Log de operaciones automáticas y manuales de horarios de caja';
COMMENT ON TABLE cash_schedule_periods IS 'Períodos de horarios múltiples de caja por cliente y día de semana';
COMMENT ON TABLE cash_schedule_client_config IS 'Configuración global de horarios automáticos por cliente';

-- 6. VERIFICAR ESTRUCTURA FINAL
SELECT 
  table_name, 
  column_name, 
  data_type 
FROM information_schema.columns 
WHERE table_name IN ('cash_schedule_operations_log', 'cash_schedule_periods', 'cash_schedule_client_config')
ORDER BY table_name, ordinal_position;
