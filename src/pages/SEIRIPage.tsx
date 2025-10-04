"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Check, X, ExternalLink, Repeat } from "lucide-react";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { showSuccess, showError } from "@/utils/toast";
import { getTasks, getProjects, completeTask, reopenTask, handleApiCall } from "@/lib/todoistApi";
import { TodoistTask, TodoistProject } from "@/lib/types";
import { shouldExcludeTaskFromTriage } from "@/utils/taskFilters";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
// Removendo importações de date-fns-tz para usar o fuso horário local do navegador

const SEIRIPage = () => {
  const navigate = useNavigate();
  const [allTasks, setAllTasks] = useState<TodoistTask[]>([]);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [keptTasksCount, setKeptTasksCount] = useState(0);
  const [deletedTasksCount, setDeletedTasksCount] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [loading, setLoading] = useState(true);

  const [lastDeletedTask, setLastDeletedTask] = useState<TodoistTask | null>(null);
  const [lastDeletedTaskOriginalIndex, setLastDeletedTaskOriginalIndex] = useState<number | null>(null);
  const [undoToastId, setUndoToastId] = useState<string | null>(null);

  const currentTask = allTasks[currentTaskIndex];
  const totalTasks = allTasks.length;

  /**
   * Formats a date string, relying on parseISO to interpret it in the local timezone.
   * Displays time (HH:mm) if present in the original date string.
   * @param dateString The date string from Todoist API (e.g., "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:SS").
   * @returns Formatted date string (e.g., "dd/MM/yyyy HH:mm") or "Sem vencimento" / "Data inválida" / "Erro de data".
   */
  const formatDueDate = (dateString: string | undefined | null) => {
    if (!dateString) return "Sem vencimento";
    
    // Ensure it's a non-empty string
    if (typeof dateString !== 'string' || dateString.trim() === '') {
      console.warn("formatDueDate received non-string or empty string:", dateString);
      return "Data inválida";
    }

    try {
      const parsedDate = parseISO(dateString); // parseISO interpreta no fuso horário local se não houver offset/Z

      if (isNaN(parsedDate.getTime())) {
        console.warn("Invalid date string after parseISO:", dateString);
        return "Data inválida";
      }

      const hasTime = dateString.includes('T') || dateString.includes(':');
      const formatString = hasTime ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy";

      return format(parsedDate, formatString, { locale: ptBR });
    } catch (e: any) {
      console.error("Error formatting date:", dateString, "Error details:", e.message, e);
      return "Erro de data";
    }
  };

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 4: return "text-red-600"; // P1
      case 3: return "text-yellow-600"; // P2
      case 2: return "text-blue-600"; // P3
      case 1: return "text-gray-600"; // P4
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

  const fetchTasksAndProjects = useCallback(async () => {
    setLoading(true);
    try {
      const [tasks, projects] = await Promise.all([
        handleApiCall(getTasks, "Carregando tarefas..."),
        handleApiCall(getProjects, "Carregando projetos..."),
      ]);

      if (tasks && projects) {
        const projectMap = new Map(projects.map((p: TodoistProject) => [p.id, p.name]));
        const tasksWithProjectNames = tasks
          .filter((task: TodoistTask) => !shouldExcludeTaskFromTriage(task))
          .filter((task: TodoistTask) => task.priority === 1) // Filtra apenas tarefas com prioridade 1 (P4)
          .map((task: TodoistTask) => {
            const projectName = projectMap.get(task.project_id) || "Caixa de Entrada";
            return {
              ...task,
              project_name: projectName
            };
          });
        setAllTasks(tasksWithProjectNames);
        if (tasksWithProjectNames.length === 0) {
          setShowSummary(true);
        } else {
          setCurrentTaskIndex(0); // Reset index to start from the beginning
          setKeptTasksCount(0);
          setDeletedTasksCount(0);
          setShowSummary(false);
        }
      } else {
        showError("Não foi possível carregar as tarefas ou projetos do Todoist.");
        navigate("/main-menu");
      }
    } catch (error) {
      console.error("SEIRI: Erro em fetchTasksAndProjects:", error);
      showError("Ocorreu um erro inesperado ao carregar dados.");
      navigate("/main-menu");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    // Always fetch fresh tasks when the component mounts
    fetchTasksAndProjects();
  }, [fetchTasksAndProjects]);

  const moveToNextTask = useCallback(() => {
    if (undoToastId) {
      toast.dismiss(undoToastId);
      setUndoToastId(null);
    }
    setLastDeletedTask(null);
    setLastDeletedTaskOriginalIndex(null);

    if (currentTaskIndex < totalTasks - 1) {
      setCurrentTaskIndex(currentTaskIndex + 1);
    } else {
      setShowSummary(true);
      // No need to remove from localStorage as we don't save progress anymore
    }
  }, [currentTaskIndex, totalTasks, undoToastId]);

  const handleKeep = useCallback(() => {
    if (currentTask) {
      const updatedTasks = allTasks.map((task, idx) =>
        idx === currentTaskIndex ? { ...task, classificacao: 'essencial' } : task
      );
      setAllTasks(updatedTasks);
      setKeptTasksCount(keptTasksCount + 1);
      showSuccess("Tarefa marcada como essencial!");
      moveToNextTask();
    }
  }, [currentTask, allTasks, currentTaskIndex, keptTasksCount, moveToNextTask]);

  const handleDelete = useCallback(async () => {
    if (!currentTask) return;

    setLastDeletedTask(currentTask);
    setLastDeletedTaskOriginalIndex(currentTaskIndex);

    const success = await handleApiCall(
      () => completeTask(currentTask.id),
      "Deletando tarefa...",
      "Tarefa deletada com sucesso!"
    );

    if (success) {
      setDeletedTasksCount((prev) => prev + 1);

      const updatedTasks = allTasks.filter((task) => task.id !== currentTask.id);
      setAllTasks(updatedTasks);

      const id = toast.custom((t) => (
        <div className="flex items-center justify-between p-3 bg-gray-800 text-white rounded-md shadow-lg">
          <span>Tarefa deletada.</span>
          <Button
            variant="link"
            onClick={() => handleUndo(t.id)}
            className="text-blue-400 hover:text-blue-200 ml-4"
          >
            Desfazer
          </Button>
        </div>
      ), { duration: 5000 });
      setUndoToastId(id);

      if (currentTaskIndex >= updatedTasks.length) {
        setShowSummary(true);
        // No need to remove from localStorage as we don't save progress anymore
      } else {
        // No need to save progress here
      }
    } else {
      showError("Falha ao deletar a tarefa.");
      setLastDeletedTask(null);
      setLastDeletedTaskOriginalIndex(null);
    }
  }, [currentTask, currentTaskIndex, allTasks]);

  const handleUndo = useCallback(async (toastId: string) => {
    if (!lastDeletedTask || lastDeletedTaskOriginalIndex === null) {
      toast.dismiss(toastId);
      showError("Não há tarefa para desfazer.");
      return;
    }

    const success = await handleApiCall(
      () => reopenTask(lastDeletedTask.id),
      "Desfazendo exclusão...",
      "Tarefa restaurada com sucesso!"
    );

    if (success) {
      setDeletedTasksCount((prev) => prev - 1);

      const newAllTasks = [...allTasks];
      newAllTasks.splice(lastDeletedTaskOriginalIndex, 0, lastDeletedTask);
      setAllTasks(newAllTasks);

      setCurrentTaskIndex(lastDeletedTaskOriginalIndex);

      if (showSummary) {
        setShowSummary(false);
      }

      toast.dismiss(toastId);
      setUndoToastId(null);
      setLastDeletedTask(null);
      setLastDeletedTaskOriginalIndex(null);
      // No need to save progress here
    } else {
      showError("Falha ao restaurar a tarefa.");
    }
  }, [lastDeletedTask, lastDeletedTaskOriginalIndex, allTasks, showSummary]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (showSummary || loading || !currentTask) return;

      if (event.key === 'd' || event.key === 'D') {
        event.preventDefault();
        handleDelete();
      } else if (event.key === 'k' || event.key === 'K') {
        event.preventDefault();
        handleKeep();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showSummary, loading, currentTask, handleDelete, handleKeep]);

  const progressValue = totalTasks > 0 ? ((currentTaskIndex + (showSummary ? 1 : 0)) / totalTasks) * 100 : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-100 p-4">
        <p className="text-lg text-green-600">Carregando tarefas para faxina...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-green-100 p-4">
      <div className="w-full max-w-3xl mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={() => navigate("/main-menu")} className="text-green-800 hover:bg-green-200">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <h1 className="text-4xl font-extrabold text-green-800 text-center flex-grow">
            SEIRI - Faxina do Backlog
          </h1>
          <div className="w-20"></div>
        </div>
        <p className="text-xl text-green-700 text-center mb-8">
          Revise cada tarefa: manter ou deletar?
        </p>
      </div>

      <Card className="w-full max-w-md shadow-lg bg-white/80 backdrop-blur-sm">
        <CardContent className="p-6">
          {showSummary ? (
            <div className="text-center space-y-4">
              <CardTitle className="text-2xl font-bold text-gray-800">Revisão Concluída!</CardTitle>
              <CardDescription className="text-lg text-gray-600">
                Você revisou {totalTasks} tarefas.
              </CardDescription>
              <p className="text-green-600 font-semibold">Manteve: {keptTasksCount}</p>
              <p className="text-red-600 font-semibold">Deletou: {deletedTasksCount}</p>
              <Button onClick={() => navigate("/main-menu")} className="mt-4 bg-blue-600 hover:bg-blue-700">
                Voltar ao Menu Principal
              </Button>
            </div>
          ) : (
            currentTask ? (
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
                  <p className="text-sm text-gray-500">
                    Projeto: <span className="font-medium text-gray-700">{currentTask.project_name}</span>
                  </p>
                  <p className={`text-lg font-semibold ${getPriorityColor(currentTask.priority)} mb-1`}>
                    Prioridade: {getPriorityLabel(currentTask.priority)}
                  </p>
                  {currentTask.due?.date && (
                    <p className="text-sm text-gray-500">
                      Vencimento: <span className="font-medium text-gray-700">{formatDueDate(currentTask.due.date)}</span>
                    </p>
                  )}
                  {currentTask.deadline && (
                    <p className="text-sm text-gray-500">
                      Data Limite: <span className="font-medium text-gray-700">{formatDueDate(currentTask.deadline)}</span>
                    </p>
                  )}
                </div>

                <div className="flex justify-center space-x-4 mt-6">
                  <Button
                    onClick={handleDelete}
                    className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-6 rounded-md transition-colors flex items-center"
                  >
                    <X className="mr-2 h-5 w-5" /> DELETAR (D)
                  </Button>
                  <Button
                    onClick={handleKeep}
                    className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-md transition-colors flex items-center"
                  >
                    <Check className="mr-2 h-5 w-5" /> MANTER (K)
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-600">
                <p>Nenhuma tarefa encontrada ou carregando...</p>
              </div>
            )
          )}
        </CardContent>
        {!showSummary && currentTask && (
          <CardFooter className="flex flex-col items-center p-6 border-t mt-6">
            <p className="text-sm text-gray-600 mb-2">
              Tarefa {currentTaskIndex + 1} de {totalTasks}
            </p>
            <Progress value={progressValue} className="w-full h-2 bg-green-200 [&>*]:bg-green-600" />
          </CardFooter>
        )}
      </Card>
      <MadeWithDyad />
    </div>
  );
};

export default SEIRIPage;