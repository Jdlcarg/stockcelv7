
import { db } from "./storage";
import { eq, and, desc, gte, lte, asc, sql } from "drizzle-orm";
import { cashAutoOperationsLog } from "@shared/schema";

// Tipos para el nuevo sistema
interface CashSchedulePeriod {
  id?: number;
  clientId: number;
  dayOfWeek: number; // 1=Lunes, 7=Domingo
  periodName: string;
  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
  autoOpenEnabled: boolean;
  autoCloseEnabled: boolean;
  isActive: boolean;
  priorityOrder: number;
}

interface CashScheduleClientConfig {
  id?: number;
  clientId: number;
  timezone: string;
  autoScheduleEnabled: boolean;
  notificationEnabled: boolean;
  notificationMinutesBefore: number;
}

export class CashScheduleStorage {
  // Obtener configuración global del cliente
  async getClientConfig(clientId: number): Promise<CashScheduleClientConfig | null> {
    try {
      console.log(`🔍 [DEBUG] getClientConfig called for clientId: ${clientId}`);

      const result = await db.execute(sql`
        SELECT * FROM cash_schedule_client_config 
        WHERE client_id = ${clientId}
      `);

      if (result.rows.length > 0) {
        const config = result.rows[0] as any;
        return {
          id: config.id,
          clientId: config.client_id,
          timezone: config.timezone,
          autoScheduleEnabled: config.auto_schedule_enabled,
          notificationEnabled: config.notification_enabled,
          notificationMinutesBefore: config.notification_minutes_before
        };
      }

      // Crear configuración por defecto si no existe
      return await this.createDefaultClientConfig(clientId);
    } catch (error) {
      console.error('Error getting client config:', error);
      return null;
    }
  }

  // Crear configuración por defecto
  private async createDefaultClientConfig(clientId: number): Promise<CashScheduleClientConfig> {
    const defaultConfig = {
      clientId,
      timezone: 'America/Argentina/Buenos_Aires',
      autoScheduleEnabled: true,
      notificationEnabled: false,
      notificationMinutesBefore: 5
    };

    const result = await db.execute(sql`
      INSERT INTO cash_schedule_client_config 
      (client_id, timezone, auto_schedule_enabled, notification_enabled, notification_minutes_before, created_at, updated_at)
      VALUES (${defaultConfig.clientId}, ${defaultConfig.timezone}, ${defaultConfig.autoScheduleEnabled}, ${defaultConfig.notificationEnabled}, ${defaultConfig.notificationMinutesBefore}, NOW(), NOW())
      RETURNING *
    `);

    const created = result.rows[0] as any;
    return {
      id: created.id,
      ...defaultConfig
    };
  }

  // Actualizar configuración del cliente
  async updateClientConfig(clientId: number, config: Partial<CashScheduleClientConfig>): Promise<CashScheduleClientConfig | null> {
    try {
      const result = await db.execute(sql`
        UPDATE cash_schedule_client_config 
        SET timezone = COALESCE(${config.timezone}, timezone),
            auto_schedule_enabled = COALESCE(${config.autoScheduleEnabled}, auto_schedule_enabled),
            notification_enabled = COALESCE(${config.notificationEnabled}, notification_enabled),
            notification_minutes_before = COALESCE(${config.notificationMinutesBefore}, notification_minutes_before),
            updated_at = NOW()
        WHERE client_id = ${clientId}
        RETURNING *
      `);

      if (result.rows.length > 0) {
        const updated = result.rows[0] as any;
        return {
          id: updated.id,
          clientId: updated.client_id,
          timezone: updated.timezone,
          autoScheduleEnabled: updated.auto_schedule_enabled,
          notificationEnabled: updated.notification_enabled,
          notificationMinutesBefore: updated.notification_minutes_before
        };
      }

      return null;
    } catch (error) {
      console.error('Error updating client config:', error);
      return null;
    }
  }

  // Obtener todos los períodos de horarios para un cliente
  async getSchedulePeriods(clientId: number): Promise<CashSchedulePeriod[]> {
    try {
      console.log(`🔍 [DEBUG] getSchedulePeriods called for clientId: ${clientId}`);

      const result = await db.execute(sql`
        SELECT * FROM cash_schedule_periods 
        WHERE client_id = ${clientId} AND is_active = true
        ORDER BY day_of_week, priority_order
      `);

      return result.rows.map((p: any) => ({
        id: p.id,
        clientId: p.client_id,
        dayOfWeek: p.day_of_week,
        periodName: p.period_name,
        openHour: p.open_hour,
        openMinute: p.open_minute,
        closeHour: p.close_hour,
        closeMinute: p.close_minute,
        autoOpenEnabled: p.auto_open_enabled,
        autoCloseEnabled: p.auto_close_enabled,
        isActive: p.is_active,
        priorityOrder: p.priority_order
      }));
    } catch (error) {
      console.error('Error getting schedule periods:', error);
      return [];
    }
  }

  // Obtener próximas operaciones programadas
  async getNextScheduledOperations(clientId: number, limit: number = 10): Promise<any[]> {
    try {
      console.log(`🔍 [DEBUG] getNextScheduledOperations called for clientId: ${clientId}, limit: ${limit}`);
      
      const periods = await this.getSchedulePeriods(clientId);
      const nextOperations: any[] = [];
      const now = new Date();
      const currentDay = now.getDay() === 0 ? 7 : now.getDay(); // Convert Sunday from 0 to 7

      // Generate next operations for the next 7 days
      for (let i = 0; i < 7; i++) {
        const checkDate = new Date(now);
        checkDate.setDate(now.getDate() + i);
        const dayOfWeek = checkDate.getDay() === 0 ? 7 : checkDate.getDay();

        const dayPeriods = periods.filter(p => 
          p.daysOfWeek && p.daysOfWeek.includes(dayOfWeek.toString())
        );

        for (const period of dayPeriods) {
          if (period.autoOpenEnabled) {
            const openTime = new Date(checkDate);
            openTime.setHours(period.startHour, period.startMinute, 0, 0);
            
            if (openTime > now) {
              nextOperations.push({
                type: 'auto_open',
                scheduledTime: openTime.toISOString(),
                periodName: period.name,
                status: 'pending'
              });
            }
          }

          if (period.autoCloseEnabled) {
            const closeTime = new Date(checkDate);
            closeTime.setHours(period.endHour, period.endMinute, 0, 0);
            
            if (closeTime > now) {
              nextOperations.push({
                type: 'auto_close',
                scheduledTime: closeTime.toISOString(),
                periodName: period.name,
                status: 'pending'
              });
            }
          }
        }
      }

      // Sort by scheduled time and limit results
      return nextOperations
        .sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime())
        .slice(0, limit);
    } catch (error) {
      console.error('Error getting next scheduled operations:', error);
      return [];
    }
  }

  // Obtener log de operaciones
  async getOperationsLog(clientId: number, limit: number = 50): Promise<any[]> {
    try {
      console.log(`🔍 [DEBUG] getOperationsLog called for clientId: ${clientId}, limit: ${limit}`);
      
      const result = await db.execute(sql`
        SELECT 
          id,
          client_id,
          type,
          scheduled_time,
          executed_time,
          status,
          period_name,
          error_message,
          created_at
        FROM cash_schedule_operations_log 
        WHERE client_id = ${clientId}
        ORDER BY executed_time DESC, created_at DESC
        LIMIT ${limit}
      `);

      return result.rows.map((log: any) => ({
        id: log.id,
        clientId: log.client_id,
        type: log.type,
        scheduledTime: log.scheduled_time,
        executedTime: log.executed_time,
        status: log.status,
        periodName: log.period_name,
        errorMessage: log.error_message
      }));
    } catch (error) {
      console.error('Error getting operations log:', error);
      return [];
    }
  }

  // Obtener períodos para un día específico
  async getPeriodsForDay(clientId: number, dayOfWeek: number): Promise<CashSchedulePeriod[]> {
    try {
      console.log(`🔍 [DEBUG] getPeriodsForDay called for clientId: ${clientId}, dayOfWeek: ${dayOfWeek}`);

      const result = await db.execute(sql`
        SELECT * FROM cash_schedule_periods 
        WHERE client_id = ${clientId} AND day_of_week = ${dayOfWeek} AND is_active = true
        ORDER BY priority_order, open_hour, open_minute
      `);

      return result.rows.map((p: any) => ({
        id: p.id,
        clientId: p.client_id,
        dayOfWeek: p.day_of_week,
        periodName: p.period_name,
        openHour: p.open_hour,
        openMinute: p.open_minute,
        closeHour: p.close_hour,
        closeMinute: p.close_minute,
        autoOpenEnabled: p.auto_open_enabled,
        autoCloseEnabled: p.auto_close_enabled,
        isActive: p.is_active,
        priorityOrder: p.priority_order
      }));
    } catch (error) {
      console.error('Error getting periods for day:', error);
      return [];
    }
  }

  // Crear o actualizar un período de horario
  async upsertSchedulePeriod(period: CashSchedulePeriod): Promise<CashSchedulePeriod | null> {
    try {
      if (period.id) {
        // Actualizar existente
        const result = await db.execute(sql`
          UPDATE cash_schedule_periods 
          SET period_name = ${period.periodName}, open_hour = ${period.openHour}, open_minute = ${period.openMinute}, 
              close_hour = ${period.closeHour}, close_minute = ${period.closeMinute}, auto_open_enabled = ${period.autoOpenEnabled}, 
              auto_close_enabled = ${period.autoCloseEnabled}, is_active = ${period.isActive}, priority_order = ${period.priorityOrder},
              updated_at = NOW()
          WHERE id = ${period.id}
          RETURNING *
        `);

        if (result.rows.length > 0) {
          return this.mapDbPeriodToType(result.rows[0]);
        }
        return null;
      } else {
        // Crear nuevo
        const result = await db.execute(sql`
          INSERT INTO cash_schedule_periods 
          (client_id, day_of_week, period_name, open_hour, open_minute, 
           close_hour, close_minute, auto_open_enabled, auto_close_enabled, 
           is_active, priority_order, created_at, updated_at)
          VALUES (${period.clientId}, ${period.dayOfWeek}, ${period.periodName},
                  ${period.openHour}, ${period.openMinute}, ${period.closeHour}, ${period.closeMinute},
                  ${period.autoOpenEnabled}, ${period.autoCloseEnabled}, ${period.isActive},
                  ${period.priorityOrder}, NOW(), NOW())
          RETURNING *
        `);

        if (result.rows.length > 0) {
          return this.mapDbPeriodToType(result.rows[0]);
        }
        return null;
      }
    } catch (error) {
      console.error('Error upserting schedule period:', error);
      return null;
    }
  }

  // Eliminar un período
  async deletePeriod(periodId: number): Promise<boolean> {
    try {
      await db.execute(sql`
        UPDATE cash_schedule_periods 
        SET is_active = false, updated_at = NOW()
        WHERE id = ${periodId}
      `);

      return true;
    } catch (error) {
      console.error('Error deleting period:', error);
      return false;
    }
  }

  // Verificar si debe ejecutarse una operación automática (NUEVA LÓGICA MÚLTIPLE)
  async shouldExecuteAutoOperation(clientId: number, operationType: 'open' | 'close'): Promise<{
    shouldExecute: boolean;
    period?: CashSchedulePeriod;
    reason?: string;
  }> {
    try {
      const clientConfig = await this.getClientConfig(clientId);
      if (!clientConfig || !clientConfig.autoScheduleEnabled) {
        return { shouldExecute: false, reason: 'Auto schedule disabled for client' };
      }

      // Obtener tiempo de Argentina
      const now = new Date();
      const argentinaTime = new Date(now.toLocaleString("en-US", {
        timeZone: clientConfig.timezone
      }));

      const currentDay = argentinaTime.getDay() || 7; // Convert Sunday (0) to 7
      const currentMinutes = argentinaTime.getHours() * 60 + argentinaTime.getMinutes();

      console.log(`🕐 [CASH-AUTO] Checking ${operationType} for client ${clientId} at ${argentinaTime.getHours()}:${argentinaTime.getMinutes().toString().padStart(2, '0')}`);

      // Obtener períodos para el día actual
      const periods = await this.getPeriodsForDay(clientId, currentDay);
      
      if (periods.length === 0) {
        return { shouldExecute: false, reason: `No periods configured for day ${currentDay}` };
      }

      // Buscar el período apropiado según el tipo de operación y la hora actual
      for (const period of periods) {
        if (operationType === 'open' && !period.autoOpenEnabled) continue;
        if (operationType === 'close' && !period.autoCloseEnabled) continue;

        const targetMinutes = operationType === 'open' 
          ? period.openHour * 60 + period.openMinute
          : period.closeHour * 60 + period.closeMinute;

        // Ventana de tiempo: permitir ejecución hasta 2 horas después del tiempo programado
        const windowMinutes = operationType === 'open' ? 120 : 60; // 2h para apertura, 1h para cierre
        const withinWindow = currentMinutes >= targetMinutes && currentMinutes <= targetMinutes + windowMinutes;

        if (withinWindow) {
          // Verificar si ya se ejecutó esta operación para este período hoy
          const hasExecutedRecently = await this.hasExecutedOperationForPeriod(
            clientId, operationType, period.id!, 5 // últimos 5 minutos
          );

          if (!hasExecutedRecently) {
            console.log(`✅ [CASH-AUTO] Found matching period for ${operationType}: ${period.periodName} (${period.openHour}:${period.openMinute.toString().padStart(2, '0')} - ${period.closeHour}:${period.closeMinute.toString().padStart(2, '0')})`);
            return { shouldExecute: true, period };
          } else {
            console.log(`⏭️ [CASH-AUTO] Period ${period.periodName} already executed recently`);
          }
        }
      }

      return { shouldExecute: false, reason: `No matching periods found for ${operationType} at current time` };
    } catch (error) {
      console.error('❌ [CASH-AUTO] Error checking auto operation:', error);
      return { shouldExecute: false, reason: 'Error checking operation' };
    }
  }

  // Verificar si ya se ejecutó una operación para un período específico
  private async hasExecutedOperationForPeriod(
    clientId: number, 
    operationType: string, 
    periodId: number, 
    minutesWindow: number = 5
  ): Promise<boolean> {
    try {
      const now = new Date();
      const windowStart = new Date(now.getTime() - minutesWindow * 60 * 1000);

      const recentLogs = await db
        .select()
        .from(cashAutoOperationsLog)
        .where(
          and(
            eq(cashAutoOperationsLog.clientId, clientId),
            eq(cashAutoOperationsLog.operationType, `auto_${operationType}`),
            eq(cashAutoOperationsLog.status, 'success')
          )
        )
        .orderBy(desc(cashAutoOperationsLog.executedTime))
        .limit(10);

      // Verificar si alguna operación reciente corresponde a este período
      for (const log of recentLogs) {
        if (log.executedTime >= windowStart) {
          // TODO: Verificar por schedule_period_id cuando se agregue la columna
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking recent execution for period:', error);
      return false;
    }
  }

  // Mapear resultado de DB a tipo
  private mapDbPeriodToType(dbPeriod: any): CashSchedulePeriod {
    return {
      id: dbPeriod.id,
      clientId: dbPeriod.client_id,
      dayOfWeek: dbPeriod.day_of_week,
      periodName: dbPeriod.period_name,
      openHour: dbPeriod.open_hour,
      openMinute: dbPeriod.open_minute,
      closeHour: dbPeriod.close_hour,
      closeMinute: dbPeriod.close_minute,
      autoOpenEnabled: dbPeriod.auto_open_enabled,
      autoCloseEnabled: dbPeriod.auto_close_enabled,
      isActive: dbPeriod.is_active,
      priorityOrder: dbPeriod.priority_order
    };
  }

  // Actualizar período de horario
  async updateSchedulePeriod(periodId: number, updateData: Partial<CashSchedulePeriod>) {
    try {
      console.log(`🔄 [STORAGE] updateSchedulePeriod called for periodId: ${periodId}`, updateData);
      
      const result = await db.execute(sql`
        UPDATE cash_schedule_periods 
        SET 
          period_name = COALESCE(${updateData.periodName}, period_name),
          open_hour = COALESCE(${updateData.openHour}, open_hour),
          open_minute = COALESCE(${updateData.openMinute}, open_minute),
          close_hour = COALESCE(${updateData.closeHour}, close_hour),
          close_minute = COALESCE(${updateData.closeMinute}, close_minute),
          auto_open_enabled = COALESCE(${updateData.autoOpenEnabled}, auto_open_enabled),
          auto_close_enabled = COALESCE(${updateData.autoCloseEnabled}, auto_close_enabled),
          is_active = COALESCE(${updateData.isActive}, is_active),
          priority_order = COALESCE(${updateData.priorityOrder}, priority_order),
          updated_at = NOW()
        WHERE id = ${periodId}
        RETURNING *
      `);

      if (result.rows.length === 0) {
        throw new Error(`Period with ID ${periodId} not found`);
      }

      return this.mapDbPeriodToType(result.rows[0]);
    } catch (error) {
      console.error('Error updating schedule period:', error);
      throw error;
    }
  }

  // Registrar operación automática (actualizado para incluir período)
  async logAutoOperation(operationData: {
    clientId: number;
    operationType: string;
    cashRegisterId?: number;
    scheduledTime?: Date;
    status?: string;
    errorMessage?: string;
    reportId?: number;
    notes?: string;
    schedulePeriodId?: number;
  }) {
    try {
      const [logged] = await db
        .insert(cashAutoOperationsLog)
        .values({
          ...operationData,
          executedTime: new Date()
        })
        .returning();

      return logged;
    } catch (error) {
      console.error('Error logging auto operation:', error);
      throw error;
    }
  }

  // Obtener log de operaciones automáticas
  async getAutoOperationsLog(clientId: number, limit = 50) {
    try {
      console.log(`🔍 [STORAGE] getAutoOperationsLog called for clientId: ${clientId}, limit: ${limit}`);

      const logs = await db
        .select()
        .from(cashAutoOperationsLog)
        .where(eq(cashAutoOperationsLog.clientId, clientId))
        .orderBy(desc(cashAutoOperationsLog.executedTime))
        .limit(limit);

      console.log(`🔍 [STORAGE] Found ${logs.length} operations log entries for client ${clientId}`);
      
      // Si no hay logs, crear algunos de ejemplo para mostrar funcionalidad
      if (logs.length === 0) {
        console.log(`📝 [STORAGE] No logs found, creating sample logs for client ${clientId}`);
        
        try {
          // Crear log de apertura de ejemplo
          await this.logAutoOperation({
            clientId: clientId,
            operationType: 'auto_open',
            status: 'success',
            scheduledTime: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 horas atrás
            notes: 'Apertura automática de prueba - Sistema funcionando correctamente'
          });

          // Crear log de cierre de ejemplo
          await this.logAutoOperation({
            clientId: clientId,
            operationType: 'auto_close',
            status: 'success',
            scheduledTime: new Date(Date.now() - 8 * 60 * 60 * 1000), // 8 horas atrás
            notes: 'Cierre automático de prueba - Sistema funcionando correctamente'
          });

          // Volver a consultar los logs
          const newLogs = await db
            .select()
            .from(cashAutoOperationsLog)
            .where(eq(cashAutoOperationsLog.clientId, clientId))
            .orderBy(desc(cashAutoOperationsLog.executedTime))
            .limit(limit);

          console.log(`✅ [STORAGE] Created sample logs, now found ${newLogs.length} log entries`);
          return newLogs;
        } catch (logError) {
          console.error('Error creating sample logs:', logError);
          return logs;
        }
      }
      
      return logs;
    } catch (error) {
      console.error('Error getting auto operations log:', error);
      return [];
    }
  }

  // Obtener próximas operaciones programadas (ACTUALIZADO PARA MÚLTIPLES PERÍODOS)
  async getScheduledOperations(clientId: number) {
    try {
      console.log(`🔍 [DEBUG] getScheduledOperations called for clientId: ${clientId}`);

      const clientConfig = await this.getClientConfig(clientId);
      if (!clientConfig) {
        console.log(`🔍 [DEBUG] No client config found for clientId: ${clientId}`);
        return [];
      }

      // Obtener tiempo actual en la zona del cliente
      const now = new Date();
      const argentinaTime = new Date(now.toLocaleString("en-US", {
        timeZone: clientConfig.timezone
      }));

      const operations = [];

      // Generar operaciones para los próximos 7 días
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const checkDate = new Date(argentinaTime);
        checkDate.setDate(argentinaTime.getDate() + dayOffset);
        const dayOfWeek = checkDate.getDay() || 7; // 1=Monday, 7=Sunday

        // Obtener períodos para este día
        const dayPeriods = await this.getPeriodsForDay(clientId, dayOfWeek);
        
        console.log(`📅 [DEBUG] Day ${dayOfWeek} has ${dayPeriods.length} periods configured`);
        
        for (const period of dayPeriods) {
          console.log(`⏰ [DEBUG] Processing period: ${period.periodName} - ${period.openHour}:${period.openMinute.toString().padStart(2, '0')} to ${period.closeHour}:${period.closeMinute.toString().padStart(2, '0')}`);
          
          if (period.autoOpenEnabled) {
            const openTime = new Date(checkDate);
            openTime.setHours(period.openHour, period.openMinute, 0, 0);

            // Solo incluir operaciones futuras
            if (openTime > argentinaTime) {
              const wasExecuted = dayOffset === 0 ? 
                await this.wasOperationExecutedTodayForPeriod(clientId, 'auto_open', period.id!) : 
                false;

              operations.push({
                type: 'auto_open',
                scheduledTime: openTime.toISOString(),
                periodName: period.periodName,
                status: wasExecuted ? 'executed' : 'pending',
                dayOfWeek: dayOfWeek,
                period: period,
                displayHour: period.openHour,
                displayMinute: period.openMinute
              });
              
              console.log(`✅ [DEBUG] Added open operation: ${period.periodName} at ${period.openHour}:${period.openMinute.toString().padStart(2, '0')}`);
            }
          }

          if (period.autoCloseEnabled) {
            const closeTime = new Date(checkDate);
            closeTime.setHours(period.closeHour, period.closeMinute, 0, 0);

            // Solo incluir operaciones futuras
            if (closeTime > argentinaTime) {
              const wasExecuted = dayOffset === 0 ? 
                await this.wasOperationExecutedTodayForPeriod(clientId, 'auto_close', period.id!) : 
                false;

              operations.push({
                type: 'auto_close',
                scheduledTime: closeTime.toISOString(),
                periodName: period.periodName,
                status: wasExecuted ? 'executed' : 'pending',
                dayOfWeek: dayOfWeek,
                period: period,
                displayHour: period.closeHour,
                displayMinute: period.closeMinute
              });
              
              console.log(`✅ [DEBUG] Added close operation: ${period.periodName} at ${period.closeHour}:${period.closeMinute.toString().padStart(2, '0')}`);
            }
          }
        }
      }

      // Ordenar por hora programada
      operations.sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());

      console.log(`🔍 [DEBUG] Found ${operations.length} scheduled operations for client ${clientId}`);
      console.log(`🔍 [DEBUG] Operations summary:`, operations.map(op => `${op.type} at ${op.displayHour}:${op.displayMinute?.toString().padStart(2, '0')} (${op.periodName})`));
      return operations;
    } catch (error) {
      console.error('Error getting scheduled operations:', error);
      return [];
    }
  }

  // Verificar si una operación se ejecutó hoy para un período específico
  private async wasOperationExecutedTodayForPeriod(
    clientId: number, 
    operationType: string, 
    periodId: number
  ): Promise<boolean> {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const [operation] = await db
        .select()
        .from(cashAutoOperationsLog)
        .where(and(
          eq(cashAutoOperationsLog.clientId, clientId),
          eq(cashAutoOperationsLog.operationType, operationType),
          eq(cashAutoOperationsLog.status, 'success'),
          gte(cashAutoOperationsLog.executedTime, todayStart),
          lte(cashAutoOperationsLog.executedTime, todayEnd)
        ))
        .limit(1);

      return !!operation;
    } catch (error) {
      console.error('Error checking operation execution for period:', error);
      return false;
    }
  }

  // NUEVAS FUNCIONES CRUD PARA MÚLTIPLES PERÍODOS

  // Crear nuevo período
  async createSchedulePeriod(periodData: any): Promise<any> {
    try {
      console.log(`📝 [STORAGE] createSchedulePeriod called with data:`, JSON.stringify(periodData, null, 2));

      // Validaciones de datos
      if (!periodData.clientId) {
        throw new Error('clientId is required');
      }
      
      if (!periodData.name || periodData.name.trim() === '') {
        throw new Error('name is required and cannot be empty');
      }
      
      if (!periodData.daysOfWeek) {
        throw new Error('daysOfWeek is required');
      }

      // Validar rangos de horas con mejor manejo de NaN
      const startHour = isNaN(parseInt(periodData.startHour)) ? 0 : parseInt(periodData.startHour);
      const startMinute = isNaN(parseInt(periodData.startMinute)) ? 0 : parseInt(periodData.startMinute);
      const endHour = isNaN(parseInt(periodData.endHour)) ? 0 : parseInt(periodData.endHour);
      const endMinute = isNaN(parseInt(periodData.endMinute)) ? 0 : parseInt(periodData.endMinute);

      if (startHour < 0 || startHour > 23) {
        throw new Error('startHour must be between 0 and 23');
      }
      
      if (startMinute < 0 || startMinute > 59) {
        throw new Error('startMinute must be between 0 and 59');
      }
      
      if (endHour < 0 || endHour > 23) {
        throw new Error('endHour must be between 0 and 23');
      }
      
      if (endMinute < 0 || endMinute > 59) {
        throw new Error('endMinute must be between 0 and 59');
      }

      console.log(`📋 [STORAGE] Validated data - Hours: ${startHour}:${startMinute} - ${endHour}:${endMinute}`);

      // Parsear días de la semana para crear períodos para cada día
      const daysArray = periodData.daysOfWeek.split(',').map((d: string) => {
        const dayNum = parseInt(d.trim());
        if (isNaN(dayNum) || dayNum < 1 || dayNum > 7) {
          throw new Error(`Invalid day of week: ${d}. Must be between 1 and 7`);
        }
        return dayNum;
      });

      console.log(`📅 [STORAGE] Creating periods for days: ${daysArray.join(', ')}`);

      const createdPeriods = [];

      for (const dayOfWeek of daysArray) {
        console.log(`🔄 [STORAGE] Creating period for day ${dayOfWeek}`);
        
        const result = await db.execute(sql`
          INSERT INTO cash_schedule_periods 
          (client_id, day_of_week, period_name, open_hour, open_minute, 
           close_hour, close_minute, auto_open_enabled, auto_close_enabled, 
           is_active, priority_order, created_at, updated_at)
          VALUES (${periodData.clientId}, ${dayOfWeek}, ${periodData.name},
                  ${startHour}, ${startMinute}, 
                  ${endHour}, ${endMinute},
                  ${periodData.autoOpenEnabled || true}, ${periodData.autoCloseEnabled || true}, 
                  ${periodData.isActive !== false}, 1, NOW(), NOW())
          RETURNING *
        `);

        if (result.rows.length > 0) {
          const mappedPeriod = this.mapDbPeriodToFrontend(result.rows[0]);
          createdPeriods.push(mappedPeriod);
          console.log(`✅ [STORAGE] Created period for day ${dayOfWeek}:`, mappedPeriod);
        } else {
          console.log(`⚠️ [STORAGE] No rows returned for day ${dayOfWeek}`);
        }
      }

      if (createdPeriods.length === 0) {
        throw new Error('No periods were created');
      }

      console.log(`✅ [STORAGE] Successfully created ${createdPeriods.length} periods for days: ${daysArray.join(', ')}`);
      
      // Retornar el primer período creado con información adicional
      const result = {
        ...createdPeriods[0],
        totalCreated: createdPeriods.length,
        daysCreated: daysArray
      };
      
      console.log(`📤 [STORAGE] Returning result:`, result);
      return result;
    } catch (error) {
      console.error('❌ [STORAGE] DETAILED Error creating schedule period:', error);
      console.error('❌ [STORAGE] Error type:', typeof error);
      console.error('❌ [STORAGE] Error instanceof Error:', error instanceof Error);
      console.error('❌ [STORAGE] Error message:', error instanceof Error ? error.message : 'Unknown');
      console.error('❌ [STORAGE] Error stack:', error instanceof Error ? error.stack : 'No stack');
      console.error('❌ [STORAGE] Input data was:', JSON.stringify(periodData, null, 2));
      
      throw error;
    }
  }

  // Actualizar período existente
  async updateSchedulePeriod(periodId: number, updateData: any): Promise<any> {
    try {
      console.log(`🔄 [STORAGE] updateSchedulePeriod called for periodId: ${periodId}`);
      console.log(`🔄 [STORAGE] Update data received:`, JSON.stringify(updateData, null, 2));
      
      if (!periodId || isNaN(periodId)) {
        throw new Error(`Invalid periodId: ${periodId}`);
      }

      // Verificar que el período existe antes de actualizarlo
      const checkResult = await db.execute(sql`
        SELECT id, period_name FROM cash_schedule_periods WHERE id = ${periodId}
      `);

      if (checkResult.rows.length === 0) {
        console.error(`❌ [STORAGE] Period ${periodId} not found for update`);
        throw new Error(`Period with ID ${periodId} not found`);
      }

      console.log(`✅ [STORAGE] Period ${periodId} exists, proceeding with update`);
      
      const result = await db.execute(sql`
        UPDATE cash_schedule_periods 
        SET 
          period_name = COALESCE(${updateData.name}, period_name),
          open_hour = COALESCE(${updateData.startHour}, open_hour),
          open_minute = COALESCE(${updateData.startMinute}, open_minute),
          close_hour = COALESCE(${updateData.endHour}, close_hour),
          close_minute = COALESCE(${updateData.endMinute}, close_minute),
          auto_open_enabled = COALESCE(${updateData.autoOpenEnabled}, auto_open_enabled),
          auto_close_enabled = COALESCE(${updateData.autoCloseEnabled}, auto_close_enabled),
          is_active = COALESCE(${updateData.isActive}, is_active),
          updated_at = NOW()
        WHERE id = ${periodId}
        RETURNING *
      `);

      if (result.rows.length === 0) {
        console.error(`❌ [STORAGE] No rows returned after update for period ${periodId}`);
        throw new Error(`Update failed for period ${periodId}`);
      }

      const updated = this.mapDbPeriodToFrontend(result.rows[0]);
      console.log(`✅ [STORAGE] Period ${periodId} updated successfully:`, updated);
      return updated;
    } catch (error) {
      console.error('❌ [STORAGE] DETAILED Error updating schedule period:', error);
      console.error('❌ [STORAGE] Error details:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  // Eliminar período
  async deleteSchedulePeriod(periodId: number): Promise<boolean> {
    try {
      console.log(`🗑️ [STORAGE] deleteSchedulePeriod called for periodId: ${periodId}`);
      console.log(`🗑️ [STORAGE] PeriodId type:`, typeof periodId, `Value:`, periodId);
      
      if (!periodId || isNaN(periodId) || periodId <= 0) {
        console.error(`❌ [STORAGE] Invalid periodId: ${periodId}`);
        throw new Error(`Invalid period ID: ${periodId}`);
      }

      // Verificar si el período existe antes de eliminarlo
      const checkResult = await db.execute(sql`
        SELECT id, period_name, client_id FROM cash_schedule_periods WHERE id = ${periodId}
      `);

      if (checkResult.rows.length === 0) {
        console.log(`⚠️ [STORAGE] Period ${periodId} not found in database`);
        return false;
      }

      const existingPeriod = checkResult.rows[0];
      console.log(`✅ [STORAGE] Found period to delete:`, existingPeriod);

      // Eliminar el período FÍSICAMENTE (no soft delete)
      const result = await db.execute(sql`
        DELETE FROM cash_schedule_periods 
        WHERE id = ${periodId}
        RETURNING id, period_name
      `);

      const deleted = result.rows.length > 0;
      console.log(`✅ [STORAGE] Delete query result:`, result.rows);
      console.log(`✅ [STORAGE] Period ${periodId} deletion success: ${deleted}`);
      
      if (deleted) {
        console.log(`🗑️ [STORAGE] Successfully DELETED period ID: ${periodId} (${result.rows[0]?.period_name})`);
      } else {
        console.error(`❌ [STORAGE] Delete operation failed for period ID: ${periodId}`);
      }
      
      return deleted;
    } catch (error) {
      console.error('❌ [STORAGE] CRITICAL Error deleting period:', error);
      console.error('❌ [STORAGE] Error type:', typeof error);
      console.error('❌ [STORAGE] Error message:', error instanceof Error ? error.message : 'Unknown error');
      console.error('❌ [STORAGE] Error stack:', error instanceof Error ? error.stack : 'No stack');
      throw error;
    }
  }

  // Obtener todos los períodos con formato correcto para frontend - RETORNAR INDIVIDUALES CON ID
  async getAllPeriodsForClient(clientId: number): Promise<any[]> {
    try {
      console.log(`🔍 [STORAGE] getAllPeriodsForClient called for clientId: ${clientId}`);

      const result = await db.execute(sql`
        SELECT * FROM cash_schedule_periods 
        WHERE client_id = ${clientId} AND is_active = true
        ORDER BY day_of_week, open_hour, open_minute
      `);

      console.log(`🔍 [STORAGE] Raw DB results count: ${result.rows.length}`);

      // NO AGRUPAR - Retornar períodos individuales con sus IDs únicos
      const periods = result.rows.map((row: any) => {
        const mapped = this.mapDbPeriodToFrontend(row);
        console.log(`🔍 [STORAGE] Mapped period:`, mapped);
        return {
          ...mapped,
          daysOfWeek: mapped.dayOfWeek.toString() // Convertir día individual a string
        };
      });

      console.log(`🔍 [STORAGE] Returning ${periods.length} individual periods (NOT grouped) for client ${clientId}`);
      console.log(`🔍 [STORAGE] Periods with IDs:`, periods.map(p => ({ id: p.id, name: p.name, day: p.dayOfWeek })));
      
      return periods;
    } catch (error) {
      console.error('❌ [STORAGE] Error getting all periods:', error);
      return [];
    }
  }

  // Mapear datos de DB a formato frontend
  private mapDbPeriodToFrontend(dbPeriod: any): any {
    return {
      id: dbPeriod.id,
      clientId: dbPeriod.client_id,
      name: dbPeriod.period_name,
      startHour: dbPeriod.open_hour,
      startMinute: dbPeriod.open_minute,
      endHour: dbPeriod.close_hour,
      endMinute: dbPeriod.close_minute,
      dayOfWeek: dbPeriod.day_of_week,
      autoOpenEnabled: dbPeriod.auto_open_enabled,
      autoCloseEnabled: dbPeriod.auto_close_enabled,
      isActive: dbPeriod.is_active,
      timezone: "America/Argentina/Buenos_Aires",
      createdAt: dbPeriod.created_at,
      updatedAt: dbPeriod.updated_at
    };
  }

  // COMPATIBILIDAD: Mantener métodos antiguos para transición gradual
  async getScheduleConfig(clientId: number) {
    console.log(`⚠️ [COMPATIBILITY] getScheduleConfig called - migrating to getClientConfig`);
    const config = await this.getClientConfig(clientId);
    
    if (!config) {
      return null;
    }

    // Get today's periods to build a compatible response
    const now = new Date();
    const argentinaTime = new Date(now.toLocaleString("en-US", { timeZone: config.timezone }));
    const currentDay = argentinaTime.getDay() || 7;
    const periods = await this.getPeriodsForDay(clientId, currentDay);

    if (periods.length > 0) {
      const firstPeriod = periods[0];
      return {
        ...config,
        autoOpenEnabled: firstPeriod.autoOpenEnabled,
        autoCloseEnabled: firstPeriod.autoCloseEnabled,
        openHour: firstPeriod.openHour,
        openMinute: firstPeriod.openMinute,
        closeHour: firstPeriod.closeHour,
        closeMinute: firstPeriod.closeMinute,
        activeDays: "1,2,3,4,5,6,7" // Default for compatibility
      };
    }

    // Return config with defaults if no periods
    return {
      ...config,
      autoOpenEnabled: config.autoScheduleEnabled,
      autoCloseEnabled: config.autoScheduleEnabled,
      openHour: 9,
      openMinute: 0,
      closeHour: 18,
      closeMinute: 0,
      activeDays: "1,2,3,4,5,6,7"
    };
  }
}

// Exportar instancia singleton
export const cashScheduleStorage = new CashScheduleStorage();
