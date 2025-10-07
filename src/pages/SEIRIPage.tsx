"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Check, Trash2, CalendarDays, ExternalLink, Repeat, Clock, SkipForward
} from "lucide-react";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { showSuccess, showError } from "@/utils/toast";
import { getTasks, completeTask, handleApiCall, updateTaskDueDate, deleteTask } from "@/lib/todoistApi";
import { format, parseISO, setHours, setMinutes, isValid, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TodoistTask } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, formatDateForDisplay } from "@/lib/utils";

const SEIRI_FILTER_KEY = 'seiri_filter_input';

const SEIRIPage = () => {
  const navigate = useNavigate();
  const [filterInput, setFilterInput] = useState(() => {
    const savedFilter = localStorage.getItem(SEIRI_FILTER_KEY);
    return savedFilter || "no due date | no priority"; // Filtro padrão para backlog
  });
  const [sessionStarted, setSessionStarted] = useState(false);
  const [tasksToTriage, setTasksToTriage] = useState<TodoistTask[]>([]);
  const [initialTotalTasksCount, setInitialTotalTasksCount] = useState(0); // Novo estado para o total inicial
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [tasksProcessed, setTasksProcessed] = useState(0); // Contador de tarefas processadas
  const [isSessionFinished, setIsSessionFinished] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filterError, setFilterError] = useState("");

  const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
  const [selectedDueDate, setSelectedDueDate] = useState<Date | undefined>(undefined);
  const [selectedDueTime, setSelectedDueTime] = useState<string>("");

  const currentTask = tasksToTriage[currentTaskIndex];

  useEffect(() => {
    localStorage.setItem(SEIRI_FILTER_KEY, filterInput);
  }, [filterInput]);

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

  const fetchTasksForTriage = useCallback(async () => {
    setLoading(true);
    setFilterError("");
    try {
      const fetchedTasks = await handleApiCall(() => getTasks(filterInput), "Carregando tarefas para triagem...");
      
      if (fetchedTasks && fetchedTasks.length > 0) {
        const filteredAndCleanedTasks = fetchedTasks
          .filter((task: TodoistTask) => task.parent_id === null) // Exclui subtarefas
          .filter((task: TodoistTask) => !task.is_completed); // Exclui tarefas já concluídas

        if (filteredAndCleanedTasks.length > 0) {
          setTasksToTriage(filteredAndCleanedTasks);
          setInitialTotalTasksCount(filteredAndCleanedTasks.length); // Define o total inicial
          setSessionStarted(true);
          setCurrentTaskIndex(0);
          setTasksProcessed(0); // Reseta o contador de processadas
          setIsSessionFinished(false);
          showSuccess(`Sessão de triagem iniciada com ${filteredAndCleanedTasks.length} tarefas.`);
        } else {
          showSuccess("Nenhuma tarefa encontrada para triagem com este filtro. Bom trabalho!");
          setIsSessionFinished(true);
          setSessionStarted(false);
          setInitialTotalTasksCount(0); // Nenhuma tarefa, então 0
        }
      } else {
        showSuccess("Nenhuma tarefa encontrada para triagem com este filtro. Bom trabalho!");
        setIsSessionFinished(true);
        setSessionStarted(false);
        setInitialTotalTasksCount(0); // Nenhuma tarefa, então 0
      }
    } catch (error: any) {
      console.error("SEIRI: Erro em fetchTasksForTriage:", error);
      setFilterError("Erro ao carregar tarefas. Verifique o filtro ou sua conexão.");
      showError("Ocorreu um erro inesperado ao carregar as tarefas.");
    } finally {
      setLoading(false);
    }
  }, [filterInput]);

  useEffect(() => {
    if (!sessionStarted) {
      fetchTasksForTriage();
    }
  }, [fetchTasksForTriage, sessionStarted]);

  const handleKeepTask = useCallback(() => {
    setTasksProcessed(prev => prev + 1); // Incrementa o contador de tarefas processadas
    if (currentTaskIndex < tasksToTriage.length - 1) {
      setCurrentTaskIndex(currentTaskIndex + 1);
    } else {
      // Se for a última tarefa na lista atual e a mantivermos, a sessão está concluída.
      setIsSessionFinished(true);
    }
    showSuccess("Tarefa mantida no backlog.");
  }, [currentTaskIndex, tasksToTriage.length]);

  const handleDeleteTask = useCallback(async () => {
    if (currentTask) {
      const success = await handleApiCall(() => deleteTask(currentTask.id), "Deletando tarefa...", "Tarefa deletada do Todoist!");
      if (success) {
        setTasksToTriage(prevTasks => {
          const updatedTasks = prevTasks.filter(task => task.id !== currentTask.id);
          if (updatedTasks.length === 0) { // Se não houver mais tarefas na lista atual
            setIsSessionFinished(true);
          }
          return updatedTasks;
        });
        setTasksProcessed(prev => prev + 1); // Incrementa o contador de tarefas processadas
        // currentTaskIndex NÃO deve mudar, a próxima tarefa na lista filtrada ocupará essa posição.
        showSuccess("Tarefa deletada.");
      } else {
        showError("Falha ao deletar a tarefa no Todoist.");
      }
    }
  }, [currentTask]);

  const handleCompleteTask = useCallback(async () => {
    if (currentTask) {
      const success = await handleApiCall(() => completeTask(currentTask.id), "Concluindo tarefa...", "Tarefa concluída no Todoist!");
      if (success) {
        setTasksToTriage(prevTasks => {
          const updatedTasks = prevTasks.filter(task => task.id !== currentTask.id);
          if (updatedTasks.length === 0) { // Se não houver mais tarefas na lista atual
            setIsSessionFinished(true);
          }
          return updatedTasks;
        });
        setTasksProcessed(prev => prev + 1); // Incrementa o contador de tarefas processadas
        // currentTaskIndex NÃO deve mudar.
        showSuccess("Tarefa concluída.");
      } else {
        showError("Falha ao concluir a tarefa no Todoist.");
      }
    }
  }, [currentTask]);

  const handleOpenRescheduleDialog = useCallback(() => {
    if (currentTask?.due?.date) {
      const parsedDate = parseISO(currentTask.due.date);
      setSelectedDueDate(isValid(parsedDate) ? parsedDate : undefined);
      if (currentTask.due.string.includes('T') || currentTask.due.string.includes(':')) {
        const timeMatch = currentTask.due.string.match(/(\d{2}:\d{2})/);
        setSelectedDueTime(timeMatch ? timeMatch[1] : "");
      } else {
        setSelectedDueTime("");
      }
    } else {
      setSelectedDueDate(addDays(new Date(), 1)); // Sugere amanhã por padrão
      setSelectedDueTime("");
    }
    setShowRescheduleDialog(true);
  }, [currentTask]);

  const handleSaveReschedule = useCallback(async () => {
    if (!currentTask || !selectedDueDate) {
      showError("Por favor, selecione uma data para reagendar.");
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
      "Reagendando tarefa...",
      "Tarefa reagendada com sucesso!"
    );

    if (success) {
      setTasksToTriage(prevTasks => {
        const updatedTasks = prevTasks.filter(task => task.id !== currentTask.id);
        if (updatedTasks.length === 0) { // Se não houver mais tarefas na lista atual
          setIsSessionFinished(true);
        }
        return updatedTasks;
      });
      setTasksProcessed(prev => prev + 1); // Incrementa o contador de tarefas processadas
      // currentTaskIndex NÃO deve mudar.
      setShowRescheduleDialog(false);
      showSuccess("Tarefa reagendada.");
    } else {
      showError("Falha ao reagendar a tarefa.");
    }
  }, [currentTask, selectedDueDate, selectedDueTime]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (loading || isSessionFinished || !currentTask || !sessionStarted || showRescheduleDialog) return;

      if (event.key === 'k' || event.key === 'K') { // K for Keep
        event.preventDefault();
        handleKeepTask();
      } else if (event.key === 'd' || event.key === 'D') { // D for Delete
        event.preventDefault();
        handleDeleteTask();
      } else if (event.key === 'r' || event.key === 'R') { // R for Reschedule
        event.preventDefault();
        handleOpenRescheduleDialog();
      } else if (event.key === 'c' || event.key === 'C') { // C for Complete
        event.preventDefault();
        handleCompleteTask();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [loading, isSessionFinished, currentTask, sessionStarted, showRescheduleDialog, handleKeepTask, handleDeleteTask, handleOpenRescheduleDialog, handleCompleteTask]);

  const taskProgressValue = initialTotalTasksCount > 0 ? (tasksProcessed / initialTotalTasksCount) * 100 : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-100 p-4">
        <p className="text-lg text-green-600">Carregando tarefas para triagem...</p>
      </div>
    );
  }

  if (isSessionFinished) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-green-100 p-4">
        <Card className="w-full max-w-md shadow-lg bg-white/80 backdrop-blur-sm p-6 text-center space-y-4">
          <CardTitle className="text-3xl font-bold text-gray-800">Sessão de Triagem Concluída!</CardTitle>
          <CardDescription className="text-lg text-gray-600">
            Você revisou {tasksProcessed} de {initialTotalTasksCount} tarefas.
          </CardDescription>
          <Button onClick={() => navigate("/main-menu")} className="mt-4 bg-blue-600 hover:bg-blue-700">
            Voltar ao Menu Principal
          </Button>
          <Button variant="outline" onClick={() => { setIsSessionFinished(false); setSessionStarted(false); setFilterInput(localStorage.getItem(SEIRI_FILTER_KEY) || "no due date | no priority"); }} className="mt-2">
            Iniciar Nova Sessão
          </Button>
        </Card>
        <MadeWithDyad />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-green-100 p-4 relative">
      <div className="w-full max-w-3xl mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={() => navigate("/main-menu")} className="text-green-800 hover:bg-green-200">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <h1 className="text-4xl font-extrabold text-green-800 text-center flex-grow">
            SEIRI - Fazer Faxina
          </h1>
          <div className="w-20"></div>
        </div>
        <p className="text-xl text-green-700 text-center mb-8">
          Limpe e organize seu backlog
        </p>
      </div>

      {!sessionStarted ? (
        <Card className="w-full max-w-md shadow-lg bg-white/80 backdrop-blur-sm p-6">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-gray-800">Definir Filtro de Backlog</CardTitle>
            <CardDescription className="text-lg text-gray-600 mt-2">
              Insira um filtro do Todoist para as tarefas que deseja revisar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="todoist-filter">Filtro Todoist</Label>
              <Input
                id="todoist-filter"
                type="text"
                placeholder="Ex: no due date | no priority"
                value={filterInput}
                onChange={(e) => {
                  setFilterInput(e.target.value);
                  setFilterError("");
                }}
                className={filterError ? "border-red-500" : ""}
              />
              {filterError && <p className="text-red-500 text-sm mt-1">{filterError}</p>}
            </div>
            <Button
              onClick={fetchTasksForTriage}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-md transition-colors"
              disabled={loading}
            >
              {loading ? "Carregando..." : "Iniciar Triagem"}
            </Button>
            <p className="text-sm text-gray-500 mt-4">
              <a href="https://todoist.com/help/articles/introduction-to-filters" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                Saiba mais sobre filtros do Todoist
              </a>
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="w-full max-w-3xl shadow-lg bg-white/80 backdrop-blur-sm p-6">
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
                  onClick={handleKeepTask}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition-colors flex items-center"
                >
                  <SkipForward className="mr-2 h-5 w-5" /> MANTER (K)
                </Button>
                <Button
                  onClick={handleDeleteTask}
                  className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-md transition-colors flex items-center"
                >
                  <Trash2 className="mr-2 h-5 w-5" /> DELETAR (D)
                </Button>
                <Button
                  onClick={handleOpenRescheduleDialog}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-md transition-colors flex items-center"
                >
                  <CalendarDays className="mr-2 h-5 w-5" /> REAGENDAR (R)
                </Button>
                <Button
                  onClick={handleCompleteTask}
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-md transition-colors flex items-center"
                >
                  <Check className="mr-2 h-5 w-5" /> CONCLUIR (C)
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-600">
              <p>Nenhuma tarefa encontrada para triagem.</p>
            </div>
          )}
          {!isSessionFinished && currentTask && (
            <CardFooter className="flex flex-col items-center p-6 border-t mt-6">
              <p className="text-sm text-gray-600 mb-2">
                Tarefa {tasksProcessed + 1} de {initialTotalTasksCount}
              </p>
              <Progress value={taskProgressValue} className="w-full h-2 bg-green-200 [&>*]:bg-green-600" />
            </CardFooter>
          )}
        </Card>
      )}

      <MadeWithDyad />

      <Dialog open={showRescheduleDialog} onOpenChange={setShowRescheduleDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Reagendar Tarefa</DialogTitle>
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
            <Button onClick={handleSaveReschedule} disabled={!selectedDueDate || loading}>
              Salvar Reagendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SEIRIPage;