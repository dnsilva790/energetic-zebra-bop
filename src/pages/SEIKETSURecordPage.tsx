"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Check, Clock, CalendarDays, ExternalLink, Repeat
} from "lucide-react";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { showSuccess, showError } from "@/utils/toast";
import { getTasks, handleApiCall, updateTaskDueDate } from "@/lib/todoistApi";
import { format, parseISO, setHours, setMinutes, isValid, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TodoistTask } from "@/lib/types";
import { shouldExcludeTaskFromTriage } from "@/utils/taskFilters";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, formatDateForDisplay } from "@/lib/utils";

const SEIKETSURecordPage: React.FC = () => {
  const navigate = useNavigate();
  const [tasksToReview, setTasksToReview] = useState<TodoistTask[]>([]);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isSessionFinished, setIsSessionFinished] = useState(false);
  const [tasksDoneTodayCount, setTasksDoneTodayCount] = useState(0);
  const [tasksPostponedCount, setTasksPostponedCount] = useState(0);

  const [showPostponeDialog, setShowPostponeDialog] = useState(false);
  const [selectedDueDate, setSelectedDueDate] = useState<Date | undefined>(undefined);
  const [selectedDueTime, setSelectedDueTime] = useState<string>("");

  const currentTask = tasksToReview[currentTaskIndex];
  const totalTasks = tasksToReview.length;

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 4: return "text-red-600";
      case 3: return "text-yellow-600";
      case 2: return "text-blue-600";
      case 1: return "text-gray-600";
      default: return "text-gray-600";
    }
  };

  const getPriorityLabel = (priority: number) => {
    switch (priority) {
      case 4: return "P1 (Urgente)";
      case 3: return "P2 (Alta)";
      case 2: return "P3 (Média)";
      case 1: return "P4 (Baixa)";
      default: return "Sem Prioridade";
    }
  };

  const fetchTasksForReview = useCallback(async () => {
    setLoading(true);
    try {
      // Filtra tarefas que são 'today' ou 'overdue'
      const fetchedTasks = await handleApiCall(() => getTasks("today | overdue"), "Carregando tarefas para revisão...");

      if (fetchedTasks && fetchedTasks.length > 0) {
        const filteredAndCleanedTasks = fetchedTasks
          .filter((task: TodoistTask) => task.parent_id === null) // Exclui subtarefas
          .filter((task: TodoistTask) => !task.is_completed); // Exclui tarefas já completadas

        if (filteredAndCleanedTasks.length > 0) {
          setTasksToReview(filteredAndCleanedTasks);
          setCurrentTaskIndex(0);
          setTasksDoneTodayCount(0);
          setTasksPostponedCount(0);
          setIsSessionFinished(false);
          showSuccess(`Sessão de revisão iniciada com ${filteredAndCleanedTasks.length} tarefas.`);
        } else {
          showSuccess("Nenhuma tarefa 'hoje' ou 'atrasada' encontrada para revisão. Bom trabalho!");
          setIsSessionFinished(true);
        }
      } else {
        showSuccess("Nenhuma tarefa 'hoje' ou 'atrasada' encontrada para revisão. Bom trabalho!");
        setIsSessionFinished(true);
      }
    } catch (error: any) {
      console.error("SEIKETSU: Erro em fetchTasksForReview:", error);
      showError("Ocorreu um erro inesperado ao carregar tarefas para revisão.");
      navigate("/main-menu");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchTasksForReview();
  }, [fetchTasksForReview]);

  const moveToNextTask = useCallback(() => {
    if (currentTaskIndex < totalTasks - 1) {
      setCurrentTaskIndex(currentTaskIndex + 1);
    } else {
      setIsSessionFinished(true);
    }
  }, [currentTaskIndex, totalTasks]);

  const handleDoTodayQuick = useCallback(() => {
    if (currentTask) {
      setTasksDoneTodayCount(prev => prev + 1);
      showSuccess("Tarefa marcada para fazer hoje!");
      moveToNextTask();
    }
  }, [currentTask, moveToNextTask]);

  const handlePostponeClick = useCallback(() => {
    if (currentTask) {
      // Pre-fill with tomorrow's date
      setSelectedDueDate(addDays(new Date(), 1));
      setSelectedDueTime(""); // Clear time
      setShowPostponeDialog(true);
    }
  }, [currentTask]);

  const handleSavePostpone = useCallback(async () => {
    if (!currentTask || !selectedDueDate) {
      showError("Por favor, selecione uma data para postergar.");
      return;
    }

    let newDueDateString = format(selectedDueDate, "yyyy-MM-dd");
    if (selectedDueTime) {
      const [hours, minutes] = selectedDueTime.split(':').map(Number);
      if (!isNaN(hours) && !isNaN(minutes)) {
        let dateWithTime = setHours(selectedDueDate, hours);
        dateWithTime = setMinutes(dateWithTime, minutes);
        newDueDateString = format(dateWithTime, "yyyy-MM-dd'T'HH:mm:ss");
      }
    }

    const success = await handleApiCall(
      () => updateTaskDueDate(currentTask.id, newDueDateString),
      "Postergando tarefa...",
      "Tarefa postergada com sucesso!"
    );

    if (success) {
      setTasksPostponedCount(prev => prev + 1);
      setShowPostponeDialog(false);
      moveToNextTask();
    } else {
      showError("Falha ao postergar a tarefa.");
    }
  }, [currentTask, selectedDueDate, selectedDueTime, moveToNextTask]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (loading || isSessionFinished || !currentTask || showPostponeDialog) return;

      if (event.key === 'r' || event.key === 'R') { // 'R' for Rápido (Do Today Quick)
        event.preventDefault();
        handleDoTodayQuick();
      } else if (event.key === 'p' || event.key === 'P') { // 'P' for Postegar
        event.preventDefault();
        handlePostponeClick();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [loading, isSessionFinished, currentTask, showPostponeDialog, handleDoTodayQuick, handlePostponeClick]);

  const taskProgressValue = totalTasks > 0 ? (currentTaskIndex / totalTasks) * 100 : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-indigo-100 p-4">
        <p className="text-lg text-indigo-600">Carregando tarefas para revisão diária...</p>
      </div>
    );
  }

  if (isSessionFinished) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-indigo-100 p-4">
        <Card className="w-full max-w-md shadow-lg bg-white/80 backdrop-blur-sm p-6 text-center space-y-4">
          <CardTitle className="text-3xl font-bold text-gray-800">Revisão Diária Concluída!</CardTitle>
          <CardDescription className="text-lg text-gray-600">
            Você revisou {totalTasks} tarefas.
          </CardDescription>
          <p className="text-green-600 font-semibold">Decididas para Hoje: {tasksDoneTodayCount}</p>
          <p className="text-blue-600 font-semibold">Postergadas: {tasksPostponedCount}</p>
          <Button onClick={() => navigate("/main-menu")} className="mt-4 bg-blue-600 hover:bg-blue-700">
            Voltar ao Menu Principal
          </Button>
          <Button variant="outline" onClick={fetchTasksForReview} className="mt-2">
            Iniciar Nova Revisão
          </Button>
        </Card>
        <MadeWithDyad />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-indigo-100 p-4 relative">
      <div className="w-full max-w-3xl mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={() => navigate("/main-menu")} className="text-indigo-800 hover:bg-indigo-200">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <h1 className="text-4xl font-extrabold text-indigo-800 text-center flex-grow">
            SEIKETSU - Revisão Diária
          </h1>
          <div className="w-20"></div> {/* Espaçador */}
        </div>
        <p className="text-xl text-indigo-700 text-center mb-8">
          Decida rapidamente: fazer hoje ou postergar?
        </p>
      </div>

      <Card className="w-full max-w-md shadow-lg bg-white/80 backdrop-blur-sm p-6">
        {currentTask ? (
          <div className="space-y-6">
            <div className="text-center">
              <CardTitle className="text-3xl font-bold text-gray-800 mb-2 flex items-center justify-center gap-2">
                {currentTask.content}
                {currentTask.due?.is_recurring && (
                  <Repeat className="h-5 w-5 text-blue-500" title="Tarefa Recorrente" />
                )}
                <a
                  href={`https://todoist.com/app/task/${currentTask.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-blue-600 transition-colors"
                  aria-label="Abrir no Todoist"
                >
                  <ExternalLink className="h-5 w-5" />
                </a>
              </CardTitle>
              {currentTask.description && (
                <CardDescription className="text-gray-700 mb-2">
                  {currentTask.description}
                </CardDescription>
              )}
              <p className={`text-lg font-semibold ${getPriorityColor(currentTask.priority)} mb-1`}>
                Prioridade: {getPriorityLabel(currentTask.priority)}
              </p>
              {currentTask.due?.date && (
                <p className="text-sm text-gray-500">
                  Vencimento: <span className="font-medium text-gray-700">{formatDateForDisplay(currentTask.due)}</span>
                </p>
              )}
              {currentTask.deadline && (
                <p className="text-sm text-gray-500">
                  Data Limite: <span className="font-medium text-gray-700">{formatDateForDisplay(currentTask.deadline)}</span>
                </p>
              )}
            </div>

            <div className="flex justify-center space-x-4 mt-6">
              <Button
                onClick={handleDoTodayQuick}
                className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-md transition-colors flex items-center"
              >
                <Check className="mr-2 h-5 w-5" /> FAZER HOJE (R)
              </Button>
              <Button
                onClick={handlePostponeClick}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition-colors flex items-center"
              >
                <CalendarDays className="mr-2 h-5 w-5" /> POSTERGAR (P)
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-600">
            <p>Nenhuma tarefa encontrada para revisão.</p>
          </div>
        )}
        {!isSessionFinished && currentTask && (
          <CardFooter className="flex flex-col items-center p-6 border-t mt-6">
            <p className="text-sm text-gray-600 mb-2">
              Tarefa {currentTaskIndex + 1} de {totalTasks}
            </p>
            <Progress value={taskProgressValue} className="w-full h-2 bg-indigo-200 [&>*]:bg-indigo-600" />
          </CardFooter>
        )}
      </Card>

      <MadeWithDyad />

      <Dialog open={showPostponeDialog} onOpenChange={setShowPostponeDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Postegar Tarefa</DialogTitle>
            <DialogDescription>
              Selecione uma nova data e, opcionalmente, um horário para a tarefa.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="date" className="text-right">
                Data
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-[240px] justify-start text-left font-normal col-span-3",
                      !selectedDueDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {selectedDueDate ? format(selectedDueDate, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={selectedDueDate}
                    onSelect={setSelectedDueDate}
                    initialFocus
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="time" className="text-right">
                Horário (HH:MM)
              </Label>
              <Input
                id="time"
                type="time"
                value={selectedDueTime}
                onChange={(e) => setSelectedDueTime(e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button onClick={handleSavePostpone} disabled={!selectedDueDate || loading}>
              Salvar Postergamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SEIKETSURecordPage;