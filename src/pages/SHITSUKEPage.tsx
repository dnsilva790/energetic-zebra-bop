"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Trash2, Archive, ArrowUpCircle, BarChart2, ExternalLink, Repeat } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { showSuccess, showError } from "@/utils/toast";
import { getTasks, completeTask, updateTask, handleApiCall } from "@/lib/todoistApi";
import { isPast, parseISO, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TodoistTask } from "@/lib/types";
import { shouldExcludeTaskFromTriage } from "@/utils/taskFilters";
import { utcToZonedTime, formatInTimeZone } from "date-fns-tz"; // Importar como named exports

const BRASILIA_TIMEZONE = 'America/Sao_Paulo'; // Fuso horário de Brasília

const SHITSUKEPage = () => {
  const navigate = useNavigate();
  const [allTasks, setAllTasks] = useState<TodoistTask[]>([]);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [deletedTasksCount, setDeletedTasksCount] = useState(0);
  const [keptTasksCount, setKeptTasksCount] = useState(0);
  const [promotedTasksCount, setPromotedTasksCount] = useState(0);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [loading, setLoading] = useState(true);

  const totalTasks = allTasks.length;
  const currentTask = allTasks[currentTaskIndex];

  /**
   * Formats a date string, handling potential time components and invalid dates.
   * Assumes Todoist dates are UTC (UTC 0) and converts them to Brasília timezone (UTC-3).
   * Displays time (HH:mm) if present in the original date string.
   * @param dateString The date string from Todoist API (e.g., "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:SSZ").
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
      let dateToParse = dateString;
      // If the date string has a time component but no explicit timezone,
      // assume it's UTC and append 'Z' to force parse as UTC.
      if (dateString.includes('T') && !dateString.endsWith('Z') && !dateString.includes('+') && !dateString.includes('-')) {
        dateToParse = dateString + 'Z';
      }

      const parsedDate = parseISO(dateToParse);

      if (isNaN(parsedDate.getTime())) {
        console.warn("Invalid date string after parseISO:", dateToParse);
        return "Data inválida";
      }

      // Convert the parsed date to the Brasília timezone for display.
      const zonedDate = utcToZonedTime(parsedDate, BRASILIA_TIMEZONE);

      const hasTime = dateString.includes('T') || dateString.includes(':');
      const formatString = hasTime ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy";

      // Format the date in the Brasília timezone
      return formatInTimeZone(zonedDate, BRASILIA_TIMEZONE, formatString, { locale: ptBR });
    } catch (e: any) {
      console.error("Error formatting date:", dateString, "Error details:", e.message, e);
      return "Erro de data";
    }
  };

  const fetchP3Tasks = useCallback(async () => {
    setLoading(true);
    const fetchedTasks = await handleApiCall(getTasks, "Carregando tarefas para revisão...");
    if (fetchedTasks) {
      const p3Tasks = fetchedTasks
        .filter((task: TodoistTask) => !shouldExcludeTaskFromTriage(task))
        .filter((task: TodoistTask) => {
          const isLowPriority = task.priority === 1 || task.priority === 2;
          const hasNoDueDate = !task.due;
          
          // Para verificar se está "atrasada" no fuso horário de Brasília
          const taskDueDate = task.due?.date ? parseISO(task.due.date) : null;
          let isOverdue = false;
          if (taskDueDate) {
            const zonedTaskDate = utcToZonedTime(taskDueDate, BRASILIA_TIMEZONE);
            const nowZoned = utcToZonedTime(new Date(), BRASILIA_TIMEZONE);
            isOverdue = isPast(zonedTaskDate, { now: nowZoned });
          }

          return isLowPriority || hasNoDueDate || isOverdue;
        });

      if (p3Tasks.length === 0) {
        showSuccess("Nenhuma tarefa para revisão semanal encontrada. Bom trabalho!");
        setShowSummary(true);
      }
      setAllTasks(p3Tasks);
    } else {
      showError("Não foi possível carregar as tarefas do Todoist.");
      navigate("/main-menu");
    }
    setLoading(false);
  }, [navigate]);

  useEffect(() => {
    fetchP3Tasks();
  }, [fetchP3Tasks]);

  const moveToNextTask = useCallback(() => {
    if (currentTaskIndex < totalTasks - 1) {
      setCurrentTaskIndex(currentTaskIndex + 1);
    } else {
      setShowSummary(true);
    }
  }, [currentTaskIndex, totalTasks]);

  const handleDelete = useCallback(() => {
    setIsConfirmationOpen(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    setIsConfirmationOpen(false);
    if (currentTask) {
      const success = await handleApiCall(() => completeTask(currentTask.id), "Deletando tarefa...", "Tarefa deletada!");
      if (success) {
        setDeletedTasksCount(deletedTasksCount + 1);
        const updatedTasks = allTasks.filter(task => task.id !== currentTask.id);
        setAllTasks(updatedTasks);
        if (currentTaskIndex >= updatedTasks.length) {
          setShowSummary(true);
        }
        showSuccess("Tarefa deletada!");
      } else {
        showError("Falha ao deletar a tarefa.");
      }
    }
  }, [currentTask, currentTaskIndex, allTasks]);

  const handleKeep = useCallback(() => {
    setKeptTasksCount(keptTasksCount + 1);
    showSuccess("Tarefa mantida em P3.");
    moveToNextTask();
  }, [keptTasksCount, moveToNextTask]);

  const handlePromote = useCallback(async () => {
    if (currentTask) {
      const success = await handleApiCall(() => updateTask(currentTask.id, { priority: 3 }), "Promovendo tarefa...", "Tarefa promovida para revisão!");
      if (success) {
        setPromotedTasksCount(promotedTasksCount + 1);
        showSuccess("Tarefa promovida para revisão!");
        moveToNextTask();
      } else {
        showError("Falha ao promover a tarefa.");
      }
    }
  }, [currentTask, promotedTasksCount, moveToNextTask]);

  const handleRunSeiton = useCallback(() => {
    navigate("/5s/seiton");
  }, [navigate]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (loading || showSummary || isConfirmationOpen || !currentTask) return;

      if (event.key === 'd' || event.key === 'D') {
        event.preventDefault();
        handleDelete();
      } else if (event.key === 'm' || event.key === 'M') {
        event.preventDefault();
        handleKeep();
      } else if (event.key === 'p' || event.key === 'P') {
        event.preventDefault();
        handlePromote();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [loading, showSummary, isConfirmationOpen, currentTask, handleDelete, handleKeep, handlePromote]);

  const progressValue = totalTasks > 0 ? ((currentTaskIndex + (showSummary ? 1 : 0)) / totalTasks) * 100 : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-100 p-4">
        <p className="text-lg text-red-600">Carregando tarefas para revisão semanal...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-red-100 p-4">
      <div className="w-full max-w-3xl mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={() => navigate("/main-menu")} className="text-red-800 hover:bg-red-200">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <h1 className="text-4xl font-extrabold text-red-800 text-center flex-grow">
            SHITSUKE - Revisão Semanal
          </h1>
          <div className="w-20"></div>
        </div>
        <p className="text-xl text-red-700 text-center mb-8">
          Faxina profunda do seu sistema
        </p>
      </div>

      <Card className="w-full max-w-md shadow-lg bg-white/80 backdrop-blur-sm p-6">
        {showSummary ? (
          <div className="text-center space-y-6">
            <CardTitle className="text-3xl font-bold text-gray-800">📊 Faxina Semanal Concluída!</CardTitle>
            <div className="space-y-2 text-lg text-gray-700">
              <p className="flex items-center justify-center gap-2"><Trash2 className="h-5 w-5 text-red-600" /> Deletadas: <span className="font-semibold">{deletedTasksCount}</span> tarefas</p>
              <p className="flex items-center justify-center gap-2"><Archive className="h-5 w-5 text-yellow-600" /> Mantidas: <span className="font-semibold">{keptTasksCount}</span> tarefas</p>
              <p className="flex items-center justify-center gap-2"><ArrowUpCircle className="h-5 w-5 text-green-600" /> Promovidas: <span className="font-semibold">{promotedTasksCount}</span> tarefas</p>
            </div>
            <Button onClick={handleRunSeiton} className="mt-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-md transition-colors flex items-center justify-center w-full">
              <BarChart2 className="mr-2 h-5 w-5" /> RODAR SEITON AGORA?
            </Button>
            <Button onClick={() => navigate("/main-menu")} variant="outline" className="mt-4 w-full text-gray-700 hover:text-gray-900 border-gray-300 hover:border-gray-400 bg-white/70 backdrop-blur-sm">
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
                  <CardDescription className="text-gray-700 mt-2">
                    {currentTask.description}
                  </CardDescription>
                )}
                <p className="text-md text-gray-500 mt-2">
                  Projeto: <span className="font-medium text-gray-700">{currentTask.project_name || "Caixa de Entrada"}</span>
                </p>
                {currentTask.due?.date && (
                  <p className="text-md text-gray-500">
                    Vencimento: <span className="font-medium text-gray-700">{formatDueDate(currentTask.due.date)}</span>
                  </p>
                )}
                {currentTask.deadline && (
                  <p className="text-md text-gray-500">
                    Data Limite: <span className="font-medium text-gray-700">{formatDueDate(currentTask.deadline)}</span>
                  </p>
                )}
              </div>

              <div className="flex flex-col space-y-4 mt-6">
                <Button
                  onClick={handleDelete}
                  className="bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-md transition-colors flex flex-col items-center h-auto"
                >
                  <Trash2 className="h-5 w-5 mb-1" /> DELETAR (D)
                  <span className="text-xs opacity-80">Esta tarefa não faz mais sentido</span>
                </Button>
                <Button
                  onClick={handleKeep}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-3 rounded-md transition-colors flex flex-col items-center h-auto"
                >
                  <Archive className="h-5 w-5 mb-1" /> MANTER EM P3 (M)
                  <span className="text-xs opacity-80">Manter no backlog por enquanto</span>
                </Button>
                <Button
                  onClick={handlePromote}
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-md transition-colors flex flex-col items-center h-auto"
                >
                  <ArrowUpCircle className="h-5 w-5 mb-1" /> PROMOVER (P)
                  <span className="text-xs opacity-80">Quero priorizar esta tarefa</span>
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-600">
              <p>Nenhuma tarefa para revisão semanal encontrada.</p>
              <Button onClick={() => navigate("/main-menu")} className="mt-4 bg-blue-600 hover:bg-blue-700">
                Voltar ao Menu Principal
              </Button>
            </div>
          )
        )}
        {!showSummary && currentTask && (
          <CardFooter className="flex flex-col items-center p-6 border-t mt-6">
            <p className="text-sm text-gray-600 mb-2">
              Tarefa P3: {currentTaskIndex + 1} de {totalTasks}
            </p>
            <Progress value={progressValue} className="w-full h-2 bg-red-200 [&>*]:bg-red-600" />
            <p className="text-xs text-gray-500 mt-1">Revisando tarefas antigas...</p>
          </CardFooter>
        )}
      </Card>

      <AlertDialog open={isConfirmationOpen} onOpenChange={setIsConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja deletar esta tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá concluir a tarefa no Todoist, removendo-a da sua lista ativa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <MadeWithDyad />
    </div>
  );
};

export default SHITSUKEPage;