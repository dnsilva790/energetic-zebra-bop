"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Check, X, LayoutDashboard, ExternalLink, Repeat, Play } from "lucide-react";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { showSuccess, showError } from "@/utils/toast";
import { getTasks, completeTask, updateTask, handleApiCall } from "@/lib/todoistApi";
import { TodoistTask, TodoistProject } from "@/lib/types";
import { shouldExcludeTaskFromTriage } from "@/utils/taskFilters";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as dateFnsTz from "date-fns-tz"; // Importar date-fns-tz como wildcard

const BRASILIA_TIMEZONE = 'America/Sao_Paulo'; // Fuso horário de Brasília

type SeitonStep = 'loading' | 'threeMinFilter' | 'executeNow' | 'priorityAssignment' | 'result';

const SEITONPage = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<SeitonStep>('loading');
  const [allTasks, setAllTasks] = useState<TodoistTask[]>([]);
  const [threeMinFilterTasks, setThreeMinFilterTasks] = useState<TodoistTask[]>([]);
  const [tasksForPriorityAssignment, setTasksForPriorityAssignment] = useState<TodoistTask[]>([]);
  const [p1Tasks, setP1Tasks] = useState<TodoistTask[]>([]);
  const [p2Tasks, setP2Tasks] = useState<TodoistTask[]>([]);
  const [p3Tasks, setP3Tasks] = useState<TodoistTask[]>([]);
  const [p4Tasks, setP4Tasks] = useState<TodoistTask[]>([]); // Adicionado P4
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  const currentTask = threeMinFilterTasks[currentTaskIndex];
  const currentTaskForAssignment = tasksForPriorityAssignment[currentTaskIndex - threeMinFilterTasks.length]; // Adjust index for assignment tasks

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
      const zonedDate = dateFnsTz.utcToZonedTime(parsedDate, BRASILIA_TIMEZONE);

      const hasTime = dateString.includes('T') || dateString.includes(':');
      const formatString = hasTime ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy";

      // Format the date in the Brasília timezone
      return dateFnsTz.formatInTimeZone(zonedDate, BRASILIA_TIMEZONE, formatString, { locale: ptBR });
    } catch (e: any) {
      console.error("Error formatting date:", dateString, "Error details:", e.message, e);
      return "Erro de data";
    }
  };

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const fetchedTasks = await handleApiCall(getTasks, "Carregando tarefas...");
    if (fetchedTasks) {
      const filteredTasks = fetchedTasks
        .filter((task: TodoistTask) => !shouldExcludeTaskFromTriage(task))
        .filter((task: TodoistTask) => !task.is_completed); // Only active tasks

      if (filteredTasks.length === 0) {
        showSuccess("Nenhuma tarefa ativa para planejar hoje. Bom trabalho!");
        setAllTasks([]); // Ensure allTasks is empty
        setThreeMinFilterTasks([]); // Ensure threeMinFilterTasks is empty
        setCurrentStep('result'); // Go directly to result if no tasks
      } else {
        setAllTasks(filteredTasks);
        setThreeMinFilterTasks([...filteredTasks]);
        setCurrentStep('threeMinFilter');
      }
    } else {
      showError("Não foi possível carregar as tarefas do Todoist.");
      navigate("/main-menu");
    }
    setLoading(false);
  }, [navigate]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const moveToNextFilterTask = useCallback(() => {
    if (currentTaskIndex < threeMinFilterTasks.length - 1) {
      setCurrentTaskIndex(currentTaskIndex + 1);
    } else {
      // All tasks have gone through 3-min filter
      setCurrentTaskIndex(0); // Reset index for next step
      if (tasksForPriorityAssignment.length > 0) {
        setCurrentStep('priorityAssignment');
      } else {
        setCurrentStep('result');
      }
    }
  }, [currentTaskIndex, threeMinFilterTasks.length, tasksForPriorityAssignment.length]);

  const handleThreeMinFilter = useCallback((isLessThanThreeMin: boolean) => {
    if (!currentTask) return;

    if (isLessThanThreeMin) {
      setCurrentStep('executeNow');
    } else {
      setTasksForPriorityAssignment((prev) => [...prev, currentTask]);
      moveToNextFilterTask();
    }
  }, [currentTask, moveToNextFilterTask]);

  const handleExecuteNow = useCallback(async (executed: boolean) => {
    if (!currentTask) return;

    if (executed) {
      const success = await handleApiCall(() => completeTask(currentTask.id), "Concluindo tarefa...", "Tarefa executada e concluída!");
      if (!success) {
        showError("Falha ao concluir a tarefa.");
      }
    } else {
      showSuccess("Tarefa não executada, será priorizada depois.");
      setTasksForPriorityAssignment((prev) => [...prev, currentTask]); // If not executed, add to priority assignment
    }
    moveToNextFilterTask();
    setCurrentStep('threeMinFilter'); // Return to 3-min filter for the next task
  }, [currentTask, moveToNextFilterTask]);

  const handlePriorityAssignment = useCallback(async (priority: 1 | 2 | 3 | 4) => {
    if (!currentTaskForAssignment) return;

    const success = await handleApiCall(() => updateTask(currentTaskForAssignment.id, { priority }), `Definindo prioridade para ${currentTaskForAssignment.content}...`, `Prioridade definida para ${currentTaskForAssignment.content}!`);
    if (success) {
      if (priority === 4) setP1Tasks((prev) => [...prev, currentTaskForAssignment]);
      else if (priority === 3) setP2Tasks((prev) => [...prev, currentTaskForAssignment]);
      else if (priority === 2) setP3Tasks((prev) => [...prev, currentTaskForAssignment]);
      else setP4Tasks((prev) => [...prev, currentTaskForAssignment]); // Adicionado P4
    } else {
      showError("Falha ao definir prioridade.");
    }

    // Move to next task for assignment
    const nextIndex = currentTaskIndex + 1;
    if (nextIndex - threeMinFilterTasks.length < tasksForPriorityAssignment.length) {
      setCurrentTaskIndex(nextIndex);
    } else {
      setCurrentStep('result');
    }
  }, [currentTaskForAssignment, currentTaskIndex, threeMinFilterTasks.length, tasksForPriorityAssignment.length]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (loading) return;

      if (currentStep === 'threeMinFilter' && currentTask) {
        if (event.key === 's' || event.key === 'S') {
          event.preventDefault();
          handleThreeMinFilter(true);
        } else if (event.key === 'n' || event.key === 'N') {
          event.preventDefault();
          handleThreeMinFilter(false);
        }
      } else if (currentStep === 'executeNow' && currentTask) {
        if (event.key === 'e' || event.key === 'E') {
          event.preventDefault();
          handleExecuteNow(true);
        } else if (event.key === 'x' || event.key === 'X') {
          event.preventDefault();
          handleExecuteNow(false);
        }
      } else if (currentStep === 'priorityAssignment' && currentTaskForAssignment) {
        if (event.key === '1') {
          event.preventDefault();
          handlePriorityAssignment(4);
        } else if (event.key === '2') {
          event.preventDefault();
          handlePriorityAssignment(3);
        } else if (event.key === '3') {
          event.preventDefault();
          handlePriorityAssignment(2);
        } else if (event.key === '4') {
          event.preventDefault();
          handlePriorityAssignment(1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [loading, currentStep, currentTask, currentTaskForAssignment, handleThreeMinFilter, handleExecuteNow, handlePriorityAssignment]);

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-100 p-4">
        <p className="text-lg text-blue-600">Carregando tarefas...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-blue-100 p-4">
      <div className="w-full max-w-3xl mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={() => navigate("/main-menu")} className="text-blue-800 hover:bg-blue-200">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <h1 className="text-4xl font-extrabold text-blue-800 text-center flex-grow">
            SEITON - Planejar Dia
          </h1>
          <p className="text-xl text-blue-700 text-center flex-grow">
            Priorize suas tarefas com torneio
          </p>
          <div className="w-20"></div> {/* Placeholder for alignment */}
        </div>
      </div>

      <Card className="w-full max-w-md shadow-lg bg-white/80 backdrop-blur-sm p-6">
        {currentStep === 'threeMinFilter' && currentTask && (
          <div className="space-y-6 text-center">
            <CardTitle className="text-2xl font-bold text-gray-800">Filtro de 3 minutos</CardTitle>
            <CardDescription className="text-lg text-gray-700">
              Esta tarefa leva menos de 3 minutos?
            </CardDescription>
            <div className="p-4 border rounded-md bg-blue-50/50">
              <p className="text-xl font-semibold text-gray-800 flex items-center justify-center gap-2">
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
              </p>
              {currentTask.due?.date && (
                <p className="text-sm text-gray-500 mt-1">
                  Vencimento: <span className="font-medium text-gray-700">{formatDueDate(currentTask.due.date)}</span>
                </p>
              )}
            </div>
            <div className="flex justify-center space-x-4 mt-6">
              <Button onClick={() => handleThreeMinFilter(true)} className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-md transition-colors">
                SIM (S)
              </Button>
              <Button onClick={() => handleThreeMinFilter(false)} className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-6 rounded-md transition-colors">
                NÃO (N)
              </Button>
            </div>
          </div>
        )}

        {currentStep === 'executeNow' && currentTask && (
          <div className="space-y-6 text-center">
            <CardTitle className="text-2xl font-bold text-gray-800">Execute agora!</CardTitle>
            <CardDescription className="text-lg text-gray-700">
              Tarefa: {currentTask.content}
            </CardDescription>
            <div className="flex justify-center space-x-4 mt-6">
              <Button onClick={() => handleExecuteNow(true)} className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-md transition-colors flex items-center">
                <Check className="mr-2 h-5 w-5" /> EXECUTEI (E)
              </Button>
              <Button onClick={() => handleExecuteNow(false)} className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-6 rounded-md transition-colors flex items-center">
                <X className="mr-2 h-5 w-5" /> NÃO EXECUTEI (X)
              </Button>
            </div>
          </div>
        )}

        {currentStep === 'priorityAssignment' && currentTaskForAssignment && (
          <div className="space-y-6 text-center">
            <CardTitle className="text-2xl font-bold text-gray-800">Qual a prioridade desta tarefa?</CardTitle>
            <div className="p-4 border rounded-md bg-blue-50/50">
              <p className="text-xl font-semibold text-gray-800 flex items-center justify-center gap-2">
                {currentTaskForAssignment.content}
                {currentTaskForAssignment.due?.is_recurring && (
                  <Repeat className="h-5 w-5 text-blue-500" title="Tarefa Recorrente" />
                )}
                <a
                  href={`https://todoist.com/app/task/${currentTaskForAssignment.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-blue-600 transition-colors"
                  aria-label="Abrir no Todoist"
                >
                  <ExternalLink className="h-5 w-5" />
                </a>
              </p>
              {currentTaskForAssignment.due?.date && (
                <p className="text-sm text-gray-500 mt-1">
                  Vencimento: <span className="font-medium text-gray-700">{formatDueDate(currentTaskForAssignment.due.date)}</span>
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 mt-6">
              <Button onClick={() => handlePriorityAssignment(4)} className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-md transition-colors">
                P1 (1)
              </Button>
              <Button onClick={() => handlePriorityAssignment(3)} className="bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-2 px-4 rounded-md transition-colors">
                P2 (2)
              </Button>
              <Button onClick={() => handlePriorityAssignment(2)} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition-colors">
                P3 (3)
              </Button>
              <Button onClick={() => handlePriorityAssignment(1)} className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-md transition-colors">
                P4 (4)
              </Button>
            </div>
          </div>
        )}

        {currentStep === 'result' && (
          <div className="space-y-6 text-center">
            <CardTitle className="text-3xl font-bold text-gray-800">Ranking atualizado!</CardTitle>
            <CardDescription className="text-lg text-gray-600">
              Suas tarefas foram priorizadas.
            </CardDescription>

            {p1Tasks.length > 0 && (
              <div className="text-left p-4 border rounded-md bg-red-50/50">
                <h3 className="text-xl font-bold text-red-700 mb-2">P1 (Urgente)</h3>
                <ul className="list-disc list-inside space-y-1">
                  {p1Tasks.map((task) => (
                    <li key={task.id} className="text-gray-800">{task.content}</li>
                  ))}
                </ul>
              </div>
            )}

            {p2Tasks.length > 0 && (
              <div className="text-left p-4 border rounded-md bg-yellow-50/50">
                <h3 className="text-xl font-bold text-yellow-700 mb-2">P2 (Alta)</h3>
                <ul className="list-disc list-inside space-y-1">
                  {p2Tasks.map((task) => (
                    <li key={task.id} className="text-gray-800">{task.content}</li>
                  ))}
                </ul>
              </div>
            )}

            {p3Tasks.length > 0 && (
              <div className="text-left p-4 border rounded-md bg-blue-50/50">
                <h3 className="text-xl font-bold text-blue-700 mb-2">P3 (Média)</h3>
                <ul className="list-disc list-inside space-y-1">
                  {p3Tasks.map((task) => (
                    <li key={task.id} className="text-gray-800">{task.content}</li>
                  ))}
                </ul>
              </div>
            )}

            {p4Tasks.length > 0 && (
              <div className="text-left p-4 border rounded-md bg-gray-50/50">
                <h3 className="text-xl font-bold text-gray-700 mb-2">P4 (Baixa)</h3>
                <ul className="list-disc list-inside space-y-1">
                  {p4Tasks.map((task) => (
                    <li key={task.id} className="text-gray-800">{task.content}</li>
                  ))}
                </ul>
              </div>
            )}

            {allTasks.length === 0 && (
              <p className="text-gray-600">Nenhuma tarefa para priorizar. Bom trabalho!</p>
            )}

            <Button onClick={() => navigate("/main-menu")} className="mt-6 bg-blue-600 hover:bg-blue-700">
              Voltar ao Menu Principal
            </Button>
          </div>
        )}

        {currentStep !== 'loading' && !currentTask && !currentTaskForAssignment && allTasks.length > 0 && currentStep !== 'result' && (
          <div className="text-center space-y-4">
            <CardTitle className="text-2xl font-bold text-gray-800">Todas as tarefas foram processadas!</CardTitle>
            <CardDescription className="text-lg text-gray-600">
              Indo para o resultado...
            </CardDescription>
            <Button onClick={() => setCurrentStep('result')} className="mt-4 bg-blue-600 hover:bg-blue-700">
              Ver Resultados
            </Button>
          </div>
        )}
      </Card>
      <MadeWithDyad />
    </div>
  );
};

export default SEITONPage;