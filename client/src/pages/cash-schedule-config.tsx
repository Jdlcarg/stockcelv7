
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import Sidebar from "@/components/layout/sidebar";
import MobileNav from "@/components/layout/mobile-nav";
import Footer from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { 
  Clock, 
  Calendar, 
  Settings, 
  Plus, 
  Trash2, 
  Edit, 
  Save, 
  RotateCcw, 
  Activity, 
  Clock3, 
  Users,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Play,
  Pause,
  Eye,
  Zap
} from "lucide-react";

interface SchedulePeriod {
  id?: number;
  clientId: number;
  name: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  daysOfWeek: string; // "1,2,3,4,5" formato
  autoOpenEnabled: boolean;
  autoCloseEnabled: boolean;
  isActive: boolean;
  timezone: string;
  createdAt?: string;
  updatedAt?: string;
}

interface OperationLog {
  id: number;
  clientId: number;
  type: 'auto_open' | 'auto_close';
  scheduledTime: string;
  executedTime: string;
  status: 'success' | 'failed' | 'pending';
  periodName: string;
  errorMessage?: string;
}

const DAYS_OF_WEEK = [
  { value: "1", label: "Lunes" },
  { value: "2", label: "Martes" },
  { value: "3", label: "Miércoles" },
  { value: "4", label: "Jueves" },
  { value: "5", label: "Viernes" },
  { value: "6", label: "Sábado" },
  { value: "7", label: "Domingo" },
];

export default function CashScheduleConfig() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Dialog states
  const [periodDialogOpen, setPeriodDialogOpen] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<SchedulePeriod | null>(null);

  // Form state for new/edit period
  const [periodForm, setPeriodForm] = useState<Partial<SchedulePeriod>>({
    name: "",
    startHour: 9,
    startMinute: 0,
    endHour: 18,
    endMinute: 0,
    daysOfWeek: "1,2,3,4,5",
    autoOpenEnabled: true,
    autoCloseEnabled: true,
    isActive: true,
    timezone: "America/Argentina/Buenos_Aires"
  });

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  // Get schedule periods
  const { data: periods = [], isLoading: periodsLoading, refetch: refetchPeriods } = useQuery({
    queryKey: ["/api/cash-schedule/periods", user?.clientId],
    queryFn: async () => {
      console.log(`🔍 [FRONTEND] Fetching periods for client: ${user?.clientId}`);
      const response = await fetch(`/api/cash-schedule/periods?clientId=${user?.clientId}`);
      if (!response.ok) {
        const errorData = await response.json();
        console.error(`❌ [FRONTEND] Failed to fetch periods:`, errorData);
        throw new Error(`Failed to fetch periods: ${errorData.error || 'Unknown error'}`);
      }
      const data = await response.json();
      console.log(`✅ [FRONTEND] Received ${data.length} periods:`, data);
      return data;
    },
    enabled: !!user?.clientId,
  });

  // Get automation service status
  const { data: serviceStatus } = useQuery({
    queryKey: ["/api/cash-schedule/service-status"],
    queryFn: async () => {
      const response = await fetch("/api/cash-schedule/service-status");
      if (!response.ok) throw new Error('Failed to fetch service status');
      return response.json();
    },
    refetchInterval: 10000,
  });

  // Get operations log
  const { data: operationsLog = [] } = useQuery({
    queryKey: ["/api/cash-schedule/operations-log", user?.clientId],
    queryFn: async () => {
      const response = await fetch(`/api/cash-schedule/operations-log?clientId=${user?.clientId}&limit=50`);
      if (!response.ok) throw new Error('Failed to fetch operations log');
      return response.json();
    },
    enabled: !!user?.clientId,
    refetchInterval: 30000,
  });

  // Get next scheduled operations - CORREGIDO ENDPOINT
  const { data: nextOperations = [] } = useQuery({
    queryKey: ["/api/cash-schedule/scheduled-operations", user?.clientId],
    queryFn: async () => {
      console.log(`🔍 [FRONTEND] Calling /api/cash-schedule/scheduled-operations for clientId: ${user?.clientId}`);
      const response = await fetch(`/api/cash-schedule/scheduled-operations?clientId=${user?.clientId}`);

      if (!response.ok) {
        console.log(`❌ [FRONTEND] Scheduled operations failed: ${response.status}`);
        return [];
      }

      const data = await response.json();
      console.log(`📋 [FRONTEND] Scheduled operations received:`, data);

      return data;
    },
    enabled: !!user?.clientId,
    refetchInterval: 30000, // Actualizar cada 30 segundos
  });

  // Save period mutation
  const savePeriodMutation = useMutation({
    mutationFn: async (periodData: Partial<SchedulePeriod>) => {
      const url = editingPeriod 
        ? `/api/cash-schedule/periods/${editingPeriod.id}`
        : '/api/cash-schedule/periods';
      const method = editingPeriod ? 'PUT' : 'POST';
      
      const payload = {
        ...periodData,
        clientId: user?.clientId
      };
      
      console.log(`🚀 [FRONTEND] ${method} ${url} with data:`, payload);
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error(`❌ [FRONTEND] Save failed:`, errorData);
        throw new Error(errorData.error || 'Failed to save period');
      }
      
      const result = await response.json();
      console.log(`✅ [FRONTEND] Save successful:`, result);
      return result;
    },
    onSuccess: (data) => {
      console.log(`✅ [FRONTEND] Period saved successfully:`, data);
      toast({
        title: "✅ Período guardado",
        description: editingPeriod ? "Período actualizado correctamente" : "Nuevo período creado correctamente",
      });
      setPeriodDialogOpen(false);
      setEditingPeriod(null);
      resetPeriodForm();
      refetchPeriods();
      queryClient.invalidateQueries({ queryKey: ["/api/cash-schedule/next-operations"] });
    },
    onError: (error) => {
      console.error(`❌ [FRONTEND] Save error:`, error);
      toast({
        title: "❌ Error",
        description: error instanceof Error ? error.message : "Error al guardar el período",
        variant: "destructive",
      });
    },
  });

  // Delete period mutation
  const deletePeriodMutation = useMutation({
    mutationFn: async (periodId: number) => {
      console.log(`🚀 [FRONTEND] Deleting period: ${periodId}`);
      
      const response = await fetch(`/api/cash-schedule/periods/${periodId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error(`❌ [FRONTEND] Delete failed:`, errorData);
        throw new Error(errorData.error || 'Failed to delete period');
      }
      
      const result = await response.json();
      console.log(`✅ [FRONTEND] Delete successful:`, result);
      return result;
    },
    onSuccess: (data) => {
      console.log(`✅ [FRONTEND] Period deleted successfully:`, data);
      toast({
        title: "✅ Período eliminado",
        description: "El período ha sido eliminado correctamente",
      });
      refetchPeriods();
      queryClient.invalidateQueries({ queryKey: ["/api/cash-schedule/next-operations"] });
    },
    onError: (error) => {
      console.error(`❌ [FRONTEND] Delete error:`, error);
      toast({
        title: "❌ Error",
        description: error instanceof Error ? error.message : "Error al eliminar el período",
        variant: "destructive",
      });
    },
  });

  const resetPeriodForm = () => {
    setPeriodForm({
      name: "",
      startHour: 9,
      startMinute: 0,
      endHour: 18,
      endMinute: 0,
      daysOfWeek: "1,2,3,4,5",
      autoOpenEnabled: true,
      autoCloseEnabled: true,
      isActive: true,
      timezone: "America/Argentina/Buenos_Aires"
    });
  };

  const openEditDialog = (period: any) => {
    console.log(`🔄 [FRONTEND] Opening edit dialog for period:`, period);
    
    setEditingPeriod(period);
    setPeriodForm({
      name: period.name,
      startHour: period.startHour,
      startMinute: period.startMinute,
      endHour: period.endHour,
      endMinute: period.endMinute,
      daysOfWeek: period.daysOfWeek || period.dayOfWeek?.toString() || "1",
      autoOpenEnabled: period.autoOpenEnabled !== false,
      autoCloseEnabled: period.autoCloseEnabled !== false,
      isActive: period.isActive !== false,
      timezone: period.timezone || "America/Argentina/Buenos_Aires"
    });
    console.log(`✅ [FRONTEND] Period form populated for editing`);
    setPeriodDialogOpen(true);
  };

  const openNewDialog = () => {
    setEditingPeriod(null);
    resetPeriodForm();
    setPeriodDialogOpen(true);
  };

  const handleSavePeriod = () => {
    if (!periodForm.name?.trim()) {
      toast({
        title: "❌ Error",
        description: "El nombre del período es requerido",
        variant: "destructive",
      });
      return;
    }

    if (!periodForm.daysOfWeek || periodForm.daysOfWeek.trim() === '') {
      toast({
        title: "❌ Error",
        description: "Debe seleccionar al menos un día de la semana",
        variant: "destructive",
      });
      return;
    }

    // Validar que las horas sean números válidos
    if (isNaN(periodForm.startHour!) || isNaN(periodForm.startMinute!) || 
        isNaN(periodForm.endHour!) || isNaN(periodForm.endMinute!)) {
      toast({
        title: "❌ Error",
        description: "Las horas y minutos deben ser números válidos",
        variant: "destructive",
      });
      return;
    }

    if (periodForm.startHour === periodForm.endHour && periodForm.startMinute === periodForm.endMinute) {
      toast({
        title: "❌ Error",
        description: "La hora de inicio y fin no pueden ser iguales",
        variant: "destructive",
      });
      return;
    }

    // Asegurarse de que los valores están en el formato correcto
    const validatedForm = {
      ...periodForm,
      startHour: Number(periodForm.startHour) || 0,
      startMinute: Number(periodForm.startMinute) || 0,
      endHour: Number(periodForm.endHour) || 0,
      endMinute: Number(periodForm.endMinute) || 0,
    };

    console.log(`🚀 [FRONTEND] Submitting validated form:`, validatedForm);
    savePeriodMutation.mutate(validatedForm);
  };

  const formatTime = (hour: number, minute: number) => {
    const h = hour ?? 0;
    const m = minute ?? 0;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const formatDays = (daysOfWeek: string | undefined) => {
    if (!daysOfWeek) return 'No especificado';
    const days = daysOfWeek.split(',');
    return days.map(day => DAYS_OF_WEEK.find(d => d.value === day)?.label).filter(Boolean).join(', ');
  };

  const toggleDaySelection = (dayValue: string) => {
    const currentDays = periodForm.daysOfWeek?.split(',') || [];
    const newDays = currentDays.includes(dayValue)
      ? currentDays.filter(d => d !== dayValue)
      : [...currentDays, dayValue].sort();
    
    setPeriodForm(prev => ({ ...prev, daysOfWeek: newDays.join(',') }));
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header
        onMobileNavToggle={() => setMobileNavOpen(!mobileNavOpen)}
        isMobileNavOpen={mobileNavOpen}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar 
          isOpen={!mobileNavOpen} 
          userRole={user?.role || ''} 
        />
        <MobileNav 
          isOpen={mobileNavOpen} 
          onClose={() => setMobileNavOpen(false)}
          userRole={user?.role || ''}
        />

        <main className="flex-1 overflow-auto bg-background">
          <div className="container mx-auto px-4 py-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                <Clock className="mr-3 h-6 w-6 text-blue-600" />
                Configuración de Horarios Múltiples
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Configura múltiples períodos de apertura y cierre automático por día
              </p>
            </div>

            {/* Service Status Card */}
            <Card className="mb-6 border-l-4 border-l-blue-500">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Activity className="mr-2 h-5 w-5" />
                    Estado del Servicio Automático
                  </div>
                  <Badge variant={serviceStatus?.isRunning ? "default" : "destructive"}>
                    {serviceStatus?.isRunning ? "🟢 Activo" : "🔴 Inactivo"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span className="font-medium">Estado:</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {serviceStatus?.isRunning ? "Servicio ejecutándose" : "Servicio detenido"}
                    </p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Clock3 className="h-5 w-5 text-blue-600" />
                      <span className="font-medium">Última verificación:</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {serviceStatus?.lastCheck ? new Date(serviceStatus.lastCheck).toLocaleString() : "N/A"}
                    </p>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Zap className="h-5 w-5 text-purple-600" />
                      <span className="font-medium">Tiempo activo:</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {serviceStatus?.uptime ? `${Math.floor(serviceStatus.uptime / 1000 / 60)} min` : "N/A"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Periods Management */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Calendar className="mr-2 h-5 w-5" />
                    Períodos Configurados
                  </div>
                  <Button onClick={openNewDialog} size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                    <Plus className="mr-2 h-4 w-4" />
                    ➕ Agregar Período
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {periodsLoading ? (
                  <div className="text-center py-8">
                    <RefreshCw className="h-8 w-8 mx-auto mb-2 animate-spin" />
                    <p>Cargando períodos...</p>
                  </div>
                ) : periods.length > 0 ? (
                  <div className="space-y-4">
                    {periods.map((period: SchedulePeriod) => {
                      console.log(`🔍 [FRONTEND] Rendering period:`, period);
                      return (
                        <div key={period.id} className="group hover:shadow-lg transition-all duration-200 bg-gradient-to-r from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-xl border-l-4 border-l-blue-500 hover:border-l-blue-600 p-5">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start space-x-4">
                              <div className="flex flex-col items-center space-y-1">
                                <div className="text-3xl">
                                  {period.isActive ? '🟢' : '🔴'}
                                </div>
                                <Badge variant="outline" className="text-[10px] px-1 py-0">
                                  ID: {period.id}
                                </Badge>
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center space-x-3 mb-3">
                                  <h4 className="font-bold text-xl text-gray-800 dark:text-white">{period.name}</h4>
                                  <Badge variant="secondary" className="text-xs">
                                    {formatDays(period.dayOfWeek?.toString() || period.daysOfWeek)}
                                  </Badge>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4 mb-3">
                                  <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                                    <div className="flex items-center space-x-2">
                                      <span className="text-green-600 text-lg">🌅</span>
                                      <span className="font-medium text-green-800 dark:text-green-200">Apertura</span>
                                    </div>
                                    <p className="text-lg font-mono font-bold text-green-700 dark:text-green-300">
                                      {formatTime(period.startHour, period.startMinute)}
                                    </p>
                                  </div>
                                  <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg">
                                    <div className="flex items-center space-x-2">
                                      <span className="text-orange-600 text-lg">🌆</span>
                                      <span className="font-medium text-orange-800 dark:text-orange-200">Cierre</span>
                                    </div>
                                    <p className="text-lg font-mono font-bold text-orange-700 dark:text-orange-300">
                                      {formatTime(period.endHour, period.endMinute)}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center space-x-2 flex-wrap gap-2">
                                  <Badge variant={period.autoOpenEnabled ? "default" : "secondary"} className="text-xs font-medium">
                                    {period.autoOpenEnabled ? '✅ Auto-Abrir' : '❌ Sin Auto-Abrir'}
                                  </Badge>
                                  <Badge variant={period.autoCloseEnabled ? "default" : "secondary"} className="text-xs font-medium">
                                    {period.autoCloseEnabled ? '✅ Auto-Cerrar' : '❌ Sin Auto-Cerrar'}
                                  </Badge>
                                  <Badge variant={period.isActive ? "outline" : "destructive"} className="text-xs">
                                    {period.isActive ? '🟢 Activo' : '🔴 Inactivo'}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-3">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  console.log(`🔄 [FRONTEND] Edit button clicked for period:`, period);
                                  openEditDialog(period);
                                }}
                                disabled={!period.id}
                                className="hover:bg-blue-50 hover:border-blue-300"
                              >
                                <Edit className="h-4 w-4 mr-1" />
                                Editar
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    disabled={!period.id}
                                    className="hover:bg-red-50 hover:border-red-300 text-red-600"
                                  >
                                    <Trash2 className="h-4 w-4 mr-1" />
                                    Eliminar
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle className="text-red-600">🗑️ ¿Eliminar período?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta acción eliminará permanentemente el período:
                                      <div className="mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded">
                                        <strong>"{period.name}"</strong><br/>
                                        ⏰ {formatTime(period.startHour, period.startMinute)} - {formatTime(period.endHour, period.endMinute)}<br/>
                                        📅 {formatDays(period.daysOfWeek)}<br/>
                                        🆔 ID: {period.id}
                                      </div>
                                      <strong className="text-red-600">Esta acción no se puede deshacer.</strong>
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>❌ Cancelar</AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={() => {
                                        console.log(`🗑️ [FRONTEND] Delete confirmed for period ID: ${period.id}`);
                                        if (period.id) {
                                          deletePeriodMutation.mutate(period.id);
                                        } else {
                                          console.error(`❌ [FRONTEND] Cannot delete period without ID`);
                                        }
                                      }}
                                      className="bg-red-600 hover:bg-red-700"
                                      disabled={!period.id || deletePeriodMutation.isPending}
                                    >
                                      {deletePeriodMutation.isPending ? (
                                        <>🔄 Eliminando...</>
                                      ) : (
                                        <>🗑️ Confirmar Eliminación</>
                                      )}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No hay períodos configurados</p>
                    <p className="text-sm">Agrega tu primer período de horarios</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Next Operations Preview */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Eye className="mr-2 h-5 w-5" />
                  Próximas Operaciones Programadas
                </CardTitle>
              </CardHeader>
              <CardContent>
                {nextOperations.length > 0 ? (
                  <div className="space-y-3">
                    {nextOperations.map((operation: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div className="text-xl">
                            {operation.type === 'auto_open' ? '🌅' : '🌆'}
                          </div>
                          <div>
                            <h4 className="font-medium">
                              {operation.type === 'auto_open' ? 'Apertura' : 'Cierre'} - {operation.periodName}
                            </h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {/* MOSTRAR HORARIOS REALES DEL PERÍODO */}
                              {operation.displayHour !== undefined && operation.displayMinute !== undefined ? (
                                `${operation.displayHour.toString().padStart(2, '0')}:${operation.displayMinute.toString().padStart(2, '0')}`
                              ) : (
                                new Date(operation.scheduledTime).toLocaleString('es-AR', {
                                  timeZone: 'America/Argentina/Buenos_Aires',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })
                              )}
                              {' - '}
                              {new Date(operation.scheduledTime).toLocaleDateString('es-AR', {
                                timeZone: 'America/Argentina/Buenos_Aires',
                                weekday: 'long',
                                day: 'numeric',
                                month: 'long'
                              })}
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline">
                          {operation.status || 'Programado'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No hay operaciones programadas</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Operations Log - Only show last 2 operations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Activity className="mr-2 h-5 w-5" />
                    Historial de Operaciones
                  </div>
                  <Badge variant="outline" className="text-xs">
                    Últimas 2 operaciones
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Registro de las operaciones automáticas más recientes
                </CardDescription>
              </CardHeader>
              <CardContent>
                {operationsLog.length > 0 ? (
                  <div className="space-y-4">
                    {operationsLog.slice(0, 2).map((log: OperationLog) => (
                      <div key={log.id} className="flex items-start justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border-l-4 border-l-blue-500">
                        <div className="flex items-start space-x-4">
                          <div className="text-2xl mt-1">
                            {log.type === 'auto_open' ? '🌅' : '🌆'}
                          </div>
                          <div className="flex-1">
                            <h4 className="font-semibold text-lg mb-1">
                              {log.type === 'auto_open' ? '🔓 Apertura Automática' : '🔒 Cierre Automático'}
                            </h4>
                            <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">
                              📋 {log.periodName}
                            </p>
                            <div className="flex items-center space-x-4 text-xs text-gray-600 dark:text-gray-400">
                              <span className="flex items-center">
                                🕐 {new Date(log.executedTime).toLocaleString('es-AR', {
                                  timeZone: 'America/Argentina/Buenos_Aires',
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                              <span className="text-gray-400">•</span>
                              <span className="text-blue-600 dark:text-blue-400">
                                ID: {log.id}
                              </span>
                            </div>
                            {log.errorMessage && (
                              <p className="text-xs text-red-600 mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded">
                                ⚠️ {log.errorMessage}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end space-y-2">
                          <Badge variant={log.status === 'success' ? 'default' : log.status === 'failed' ? 'destructive' : 'secondary'} className="text-xs font-medium">
                            {log.status === 'success' ? '✅ Éxito' : log.status === 'failed' ? '❌ Error' : '⏳ Pendiente'}
                          </Badge>
                          <div className="text-xs text-gray-500">
                            {log.status === 'success' ? '🟢 Completado' : log.status === 'failed' ? '🔴 Falló' : '🟡 Pendiente'}
                          </div>
                        </div>
                      </div>
                    ))}
                    {operationsLog.length > 2 && (
                      <div className="text-center py-3">
                        <Badge variant="outline" className="text-xs text-gray-500">
                          +{operationsLog.length - 2} operaciones más en el historial completo
                        </Badge>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                      <Activity className="h-8 w-8 opacity-50" />
                    </div>
                    <h3 className="font-medium text-lg mb-2">Sin operaciones registradas</h3>
                    <p className="text-sm">
                      Las operaciones automáticas aparecerán aquí cuando se ejecuten
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Period Dialog */}
      <Dialog open={periodDialogOpen} onOpenChange={setPeriodDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              {editingPeriod ? '✏️ Editar Período' : '➕ Nuevo Período'}
              {editingPeriod && (
                <Badge variant="outline" className="ml-2">
                  ID: {editingPeriod.id}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {editingPeriod 
                ? `Modificando el período "${editingPeriod.name}" - Podrás cambiar horarios y configuración de automatización`
                : 'Configura los horarios de apertura y cierre automático para un nuevo período'
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nombre del Período</Label>
              <Input
                id="name"
                value={periodForm.name || ''}
                onChange={(e) => setPeriodForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ej: Horario Mañana, Turno Tarde..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Hora de Inicio</Label>
                <div className="flex space-x-2">
                  <Select 
                    value={periodForm.startHour?.toString()} 
                    onValueChange={(value) => setPeriodForm(prev => ({ ...prev, startHour: parseInt(value) }))}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({length: 24}, (_, i) => (
                        <SelectItem key={i} value={i.toString()}>
                          {i.toString().padStart(2, '0')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select 
                    value={periodForm.startMinute?.toString()} 
                    onValueChange={(value) => setPeriodForm(prev => ({ ...prev, startMinute: parseInt(value) }))}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 15, 30, 45].map(minute => (
                        <SelectItem key={minute} value={minute.toString()}>
                          {minute.toString().padStart(2, '0')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Hora de Fin</Label>
                <div className="flex space-x-2">
                  <Select 
                    value={periodForm.endHour?.toString()} 
                    onValueChange={(value) => setPeriodForm(prev => ({ ...prev, endHour: parseInt(value) }))}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({length: 24}, (_, i) => (
                        <SelectItem key={i} value={i.toString()}>
                          {i.toString().padStart(2, '0')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select 
                    value={periodForm.endMinute?.toString()} 
                    onValueChange={(value) => setPeriodForm(prev => ({ ...prev, endMinute: parseInt(value) }))}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 15, 30, 45].map(minute => (
                        <SelectItem key={minute} value={minute.toString()}>
                          {minute.toString().padStart(2, '0')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Días de la Semana</Label>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map(day => (
                  <Button
                    key={day.value}
                    type="button"
                    variant={periodForm.daysOfWeek?.includes(day.value) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleDaySelection(day.value)}
                  >
                    {day.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="auto-open">Apertura Automática</Label>
                <Switch
                  id="auto-open"
                  checked={periodForm.autoOpenEnabled}
                  onCheckedChange={(checked) => setPeriodForm(prev => ({ ...prev, autoOpenEnabled: checked }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="auto-close">Cierre Automático</Label>
                <Switch
                  id="auto-close"
                  checked={periodForm.autoCloseEnabled}
                  onCheckedChange={(checked) => setPeriodForm(prev => ({ ...prev, autoCloseEnabled: checked }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="is-active">Período Activo</Label>
                <Switch
                  id="is-active"
                  checked={periodForm.isActive}
                  onCheckedChange={(checked) => setPeriodForm(prev => ({ ...prev, isActive: checked }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPeriodDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSavePeriod} disabled={savePeriodMutation.isPending}>
              {savePeriodMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {editingPeriod ? 'Actualizar' : 'Crear'} Período
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
