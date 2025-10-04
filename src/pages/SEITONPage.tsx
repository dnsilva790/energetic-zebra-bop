"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Check, X, ExternalLink, Repeat, Play, ChevronLeft, ChevronRight, Bug } from "lucide-react";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { showSuccess, showError } from "@/utils/toast";
import { getTasks, completeTask, updateTask, handleApiCall } from "@/lib/todoistApi";
import { TodoistTask } from "@/lib/types";
import { shouldExcludeTaskFromTriage } from "@/utils/taskFilters";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as dateFnsTz from "date-fns-tz";

const BRASILIA_TIMEZONE = 'America/Sao_Paulo';
const RANKING_SIZE = 24; // P1 (4) + P2 (20)
const SEITON_PROGRESS_KEY = 'seiton_progress';

type SeitonStep = 'loading' | 'tournamentComparison' | 'result';

interface SeitonProgress {
  tournamentQueue: TodoistTask[];
  rankedTasks: TodoistTask[];
  p3Tasks: TodoistTask[];
  currentStep: SeitonStep;
  currentChallenger: TodoistTask | null;
  currentOpponentIndex: number | null;
}

const SEITONPage = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<SeitonStep>('loading');
  const [allFetchedTasks, setAllFetchedTasks] = useState<TodoistTask[]>([]);
  const [tournamentQueue, setTournamentQueue] = useState<TodoistTask[]>([]);
  const [rankedTasks, setRankedTasks] = useState<TodoistTask[]>([]);
  const [p3Tasks, setP3Tasks] = useState<TodoistTask[]>([]);
  
  const [currentChallenger, setCurrentChallenger] = useState<TodoistTask | null>(null);
  const [currentOpponentIndex, setCurrentOpponentIndex] = useState<number | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [showDebugPanel, setShowDebugPanel] = useState(false); // Estado para o painel de debug

  useEffect(() => {
    console.log("SEITONPage mounted.");
    return () => console.log("SEITONPage unmounted.");
  }, []);

  useEffect(() => {
    console.log("SEITONPage - currentStep changed to:", currentStep);
    console.log("SEITONPage - currentChallenger:", currentChallenger?.content || "Nenhum");
    console.log("SEITONPage - currentOpponentIndex:", currentOpponentIndex);
    console.log("SEITONPage - rankedTasks length:", rankedTasks.length, "IDs:", rankedTasks.map(t => t.id));
    console.log("SEITONPage - p3Tasks length:", p3Tasks.length, "IDs:", p3Tasks.map(t => t.id));
    console.log("SEITONPage - tournamentQueue length:", tournamentQueue.length, "IDs:", tournamentQueue.map(t => t.id));
  }, [currentStep, currentChallenger, currentOpponentIndex, rankedTasks, p3Tasks, tournamentQueue]);

  const formatDueDate = (dateString: string | undefined | null) => {
    if (!dateString) return "Sem vencimento";
    
    if (typeof dateString !== 'string' || dateString.trim() === '') {
      console.warn("formatDueDate received non-string or empty string:", dateString);
      return "Data inválida";
    }

    try {
      let dateToParse = dateString;
      if (dateString.includes('T') && !dateString.endsWith('Z') && !dateString.includes('+') && !dateString.includes('-')) {
        dateToParse = dateString + 'Z';
      }

      const parsedDate = parseISO(dateToParse);

      if (isNaN(parsedDate.getTime())) {
        console.warn("Invalid date string after parseISO:", dateToParse);
        return "Data inválida";
      }

      const zonedDate = dateFnsTz.utcToZonedTime(parsedDate, BRASILIA_TIMEZONE);
      const hasTime = dateString.includes('T') || dateString.includes(':');
      const formatString = hasTime ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy";

      return dateFnsTz.formatInTimeZone(zonedDate, BRASILIA_TIMEZONE, formatString, { locale: ptBR });
    } catch (e: any) {
      console.error("Error formatting date:", dateString, "Error details:", e.message, e);
      return "Erro de data";
    }
  };

  const saveProgress = useCallback(() => {
    const progress: SeitonProgress = {
      tournamentQueue,
      rankedTasks,
      p3Tasks,
      currentStep,
      currentChallenger,
      currentOpponentIndex,
    };
    localStorage.setItem(SEITON_PROGRESS_KEY, JSON.stringify(progress));
    console.log("SEITONPage - Progress saved:", progress);
  }, [tournamentQueue, rankedTasks, p3Tasks, currentStep, currentChallenger, currentOpponentIndex]);

  const loadProgress = useCallback((): SeitonProgress | null => {
    const savedProgress = localStorage.getItem(SEITON_PROGRESS_KEY);
    if (savedProgress) {
      try {
        const progress: SeitonProgress = JSON.parse(savedProgress);
        console.log("SEITONPage - Progress loaded:", progress);
        return progress;
      } catch (e) {
        console.error("SEITONPage - Error parsing saved progress from localStorage:", e);
        localStorage.removeItem(SEITON_PROGRESS_KEY);
        return null;
      }
    }
    console.log("SEITONPage - No saved progress found.");
    return null;
  }, []);

  const fetchAndSetupTasks = useCallback(async () => {
    setLoading(true);
    console.log("SEITONPage - fetchAndSetupTasks: Starting API call to get tasks.");
    const fetchedTasks = await handleApiCall(getTasks, "Carregando tarefas...");
    if (!fetchedTasks) {
      showError("Não foi possível carregar as tarefas do Todoist.");
      navigate("/main-menu");
      setLoading(false);
      return;
    }

    const activeTasks = fetchedTasks
      .filter((task: TodoistTask) => !shouldExcludeTaskFromTriage(task))
      .filter((task: TodoistTask) => !task.is_completed);
    console.log("SEITONPage - Active tasks from API:", activeTasks.map(t => t.content));

    setAllFetchedTasks(activeTasks);

    const savedProgress = loadProgress();

    let currentTournamentQueue: TodoistTask[] = [];
    let currentRankedTasks: TodoistTask[] = [];
    let currentP3Tasks: TodoistTask[] = [];
    let currentChallenger: TodoistTask | null = null;
    let currentOpponentIndex: number | null = null;
    let currentStepState: SeitonStep = 'loading';

    if (savedProgress) {
      currentTournamentQueue = savedProgress.tournamentQueue;
      currentRankedTasks = savedProgress.rankedTasks;
      currentP3Tasks = savedProgress.p3Tasks;
      currentChallenger = savedProgress.currentChallenger;
      currentOpponentIndex = savedProgress.currentOpponentIndex;
      currentStepState = savedProgress.currentStep;
      console.log("SEITONPage - Loaded progress applied. Queue:", currentTournamentQueue.map(t => t.content), "Ranked:", currentRankedTasks.map(t => t.content), "P3:", currentP3Tasks.map(t => t.content));
    }

    const processedTaskIds = new Set<string>();
    currentTournamentQueue.forEach(t => processedTaskIds.add(t.id));
    currentRankedTasks.forEach(t => processedTaskIds.add(t.id));
    currentP3Tasks.forEach(t => processedTaskIds.add(t.id));
    if (currentChallenger) processedTaskIds.add(currentChallenger.id);
    console.log("SEITONPage - Processed Task IDs (from loaded state):", Array.from(processedTaskIds));

    const newTasks = activeTasks.filter(task => !processedTaskIds.has(task.id));
    console.log("SEITONPage - New tasks to add to queue:", newTasks.map(t => t.content));

    if (newTasks.length > 0) {
      currentTournamentQueue = [...currentTournamentQueue, ...newTasks];
      if (currentStepState === 'result' || (savedProgress && savedProgress.tournamentQueue.length === 0 && newTasks.length > 0)) {
        currentStepState = 'tournamentComparison';
      }
      showSuccess(`${newTasks.length} novas tarefas adicionadas para triagem.`);
    }

    setTournamentQueue(currentTournamentQueue);
    setRankedTasks(currentRankedTasks);
    setP3Tasks(currentP3Tasks);
    setCurrentChallenger(currentChallenger);
    setCurrentOpponentIndex(currentOpponentIndex);
    setCurrentStep(currentStepState);

    if (currentTournamentQueue.length === 0 && currentRankedTasks.length === 0 && currentP3Tasks.length === 0) {
      showSuccess("Nenhuma tarefa ativa para planejar hoje. Bom trabalho!");
      setCurrentStep('result');
      localStorage.removeItem(SEITON_PROGRESS_KEY);
    } else if (currentStepState === 'loading' && currentTournamentQueue.length > 0) {
      setCurrentStep('tournamentComparison');
    }
    setLoading(false);
    console.log("SEITONPage - fetchAndSetupTasks: Finished loading tasks. Final Queue:", currentTournamentQueue.map(t => t.content));
  }, [navigate, loadProgress]);

  useEffect(() => {
    fetchAndSetupTasks();
  }, [fetchAndSetupTasks]);

  useEffect(() => {
    if (!loading) {
      saveProgress();
    }
  }, [tournamentQueue, rankedTasks, p3Tasks, currentStep, currentChallenger, currentOpponentIndex, loading, saveProgress]);

  const startNextTournamentComparison = useCallback(() => {
    console.log("SEITONPage - startNextTournamentComparison called.");
    if (tournamentQueue.length === 0) {
      console.log("SEITONPage - Tournament queue is empty, moving to result.");
      setCurrentStep('result');
      localStorage.removeItem(SEITON_PROGRESS_KEY);
      return;
    }

    const nextChallenger = tournamentQueue[0];
    setCurrentChallenger(nextChallenger);
    console.log("SEITONPage - Next Challenger:", nextChallenger.content);

    if (rankedTasks.length === 0) {
      console.log("SEITONPage - Ranked tasks is empty, adding challenger directly.");
      setRankedTasks(prev => {
        const newRanked = [...prev, nextChallenger];
        setTournamentQueue(prevQueue => prevQueue.slice(1));
        setCurrentChallenger(null);
        return newRanked;
      });
      return;
    }

    const opponentIndex = Math.min(RANKING_SIZE - 1, rankedTasks.length - 1);
    setCurrentOpponentIndex(opponentIndex);
    setCurrentStep('tournamentComparison');
    console.log("SEITONPage - Starting comparison. Opponent Index:", opponentIndex, "Opponent:", rankedTasks[opponentIndex]?.content);
  }, [tournamentQueue, rankedTasks]);

  useEffect(() => {
    console.log("SEITONPage - Flow management effect triggered. Current step:", currentStep);
    if (currentStep === 'tournamentComparison' && !currentChallenger && tournamentQueue.length > 0) {
      console.log("SEITONPage - Flow: Starting next tournament comparison.");
      startNextTournamentComparison();
    } else if (currentStep === 'tournamentComparison' && !currentChallenger && tournamentQueue.length === 0) {
      console.log("SEITONPage - Flow: Tournament queue exhausted, moving to result.");
      setCurrentStep('result');
      localStorage.removeItem(SEITON_PROGRESS_KEY);
    } else if (currentStep === 'loading' && tournamentQueue.length > 0) {
      console.log("SEITONPage - Flow: Loaded with tasks in queue, starting tournament.");
      setCurrentStep('tournamentComparison');
      startNextTournamentComparison();
    } else if (currentStep === 'loading' && tournamentQueue.length === 0 && allFetchedTasks.length === 0) {
      console.log("SEITONPage - Flow: No tasks at all, moving to result.");
      setCurrentStep('result');
      localStorage.removeItem(SEITON_PROGRESS_KEY);
    }
  }, [currentStep, currentChallenger, tournamentQueue, allFetchedTasks.length, startNextTournamentComparison]);

  const handleTournamentComparison = useCallback(async (challengerWins: boolean) => {
    if (!currentChallenger || currentOpponentIndex === null) {
      console.error("SEITONPage - handleTournamentComparison: Invalid state for comparison.");
      return;
    }

    console.log(`SEITONPage - handleTournamentComparison: Challenger wins? ${challengerWins}. Challenger: ${currentChallenger.content}, Opponent Index: ${currentOpponentIndex}`);

    const opponentTask = rankedTasks[currentOpponentIndex];
    let newRankedTasks = [...rankedTasks];
    let newP3Tasks = [...p3Tasks];
    let nextOpponentIndex: number | null = null;

    const updateTaskAndReturn = async (task: TodoistTask, newPriority: number): Promise<TodoistTask> => {
      if (task.priority !== newPriority) {
        console.log(`SEITONPage - Updating Todoist priority for task ${task.content} from ${task.priority} to ${newPriority}`);
        const updatedTodoistTask = await handleApiCall(
          () => updateTask(task.id, { priority: newPriority }),
          `Atualizando prioridade para ${task.content}...`
        );
        if (updatedTodoistTask) {
          return { ...task, priority: newPriority };
        }
      }
      return task;
    };

    if (challengerWins) {
      console.log("SEITONPage - Challenger wins, inserting into rankedTasks.");
      newRankedTasks.splice(currentOpponentIndex, 0, currentChallenger);
      
      if (newRankedTasks.length > RANKING_SIZE) {
        const pushedOutTask = newRankedTasks.pop();
        if (pushedOutTask) {
          newP3Tasks.push(pushedOutTask);
          console.log(`SEITONPage - Ranked list full, pushed out ${pushedOutTask.content} to P3.`);
        }
      }
      
      nextOpponentIndex = currentOpponentIndex - 1;
      if (nextOpponentIndex < 0) {
        console.log("SEITONPage - Challenger reached top (P1).");
        const updatedChallenger = await updateTaskAndReturn(currentChallenger, 4);
        setCurrentChallenger(null);
        setCurrentOpponentIndex(null);
        setTournamentQueue(prev => prev.slice(1));
        newRankedTasks = newRankedTasks.map(task => task.id === updatedChallenger.id ? updatedChallenger : task);
      } else {
        console.log(`SEITONPage - Challenger continues to fight, next opponent index: ${nextOpponentIndex}`);
        setCurrentChallenger(currentChallenger);
        setCurrentOpponentIndex(nextOpponentIndex);
      }
    } else {
      console.log("SEITONPage - Opponent wins, challenger loses.");
      if (newRankedTasks.length < RANKING_SIZE) {
        newRankedTasks.push(currentChallenger);
        console.log("SEITONPage - Ranked list not full, adding challenger to end.");
      } else {
        newP3Tasks.push(currentChallenger);
        console.log("SEITONPage - Ranked list full, adding challenger to P3.");
      }
      setCurrentChallenger(null);
      setCurrentOpponentIndex(null);
      setTournamentQueue(prev => prev.slice(1));
    }

    console.log("SEITONPage - Updating priorities for ranked and P3 tasks.");
    const updatedP1Tasks = await Promise.all(
      newRankedTasks.slice(0, 4).map(task => updateTaskAndReturn(task, 4))
    );
    const updatedP2Tasks = await Promise.all(
      newRankedTasks.slice(4, RANKING_SIZE).map(task => updateTaskAndReturn(task, 3))
    );
    const updatedP3Tasks = await Promise.all(
      newP3Tasks.map(task => updateTaskAndReturn(task, 2))
    );

    newRankedTasks = [...updatedP1Tasks, ...updatedP2Tasks];
    newP3Tasks = updatedP3Tasks;

    setRankedTasks(newRankedTasks);
    setP3Tasks(newP3Tasks);

    console.log("SEITONPage - After comparison. New Ranked:", newRankedTasks.map(t => t.content), "New P3:", newP3Tasks.map(t => t.content));

    if (!currentChallenger && tournamentQueue.length === 0 && nextOpponentIndex === null) {
      console.log("SEITONPage - Tournament finished, moving to result.");
      setCurrentStep('result');
      localStorage.removeItem(SEITON_PROGRESS_KEY);
    } else if (!currentChallenger && tournamentQueue.length > 0) {
      console.log("SEITONPage - Challenger found its place, starting next comparison.");
      startNextTournamentComparison();
    }
  }, [currentChallenger, currentOpponentIndex, rankedTasks, p3Tasks, tournamentQueue, startNextTournamentComparison]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (loading) return;

      if (currentStep === 'tournamentComparison' && currentChallenger && currentOpponentIndex !== null) {
        if (event.key === '1') {
          event.preventDefault();
          handleTournamentComparison(true);
        } else if (event.key === '2') {
          event.preventDefault();
          handleTournamentComparison(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [loading, currentStep, currentChallenger, currentOpponentIndex, handleTournamentComparison]);

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

  const renderTaskCard = (task: TodoistTask | null, title: string, description: string, priorityOverride?: number) => {
    if (!task) return null;
    const displayPriority = priorityOverride !== undefined ? priorityOverride : task.priority;
    return (
      <Card className="w-full shadow-lg bg-white/80 backdrop-blur-sm p-4">
        <CardHeader className="text-center p-0 mb-2">
          <CardTitle className="text-xl font-bold text-gray-800 flex items-center justify-center gap-2">
            {task.content}
            {task.due?.is_recurring && (
              <Repeat className="h-4 w-4 text-blue-500" title="Tarefa Recorrente" />
            )}
            <a
              href={`https://todoist.com/app/task/${task.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-blue-600 transition-colors"
              aria-label="Abrir no Todoist"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </CardTitle>
          {task.description && (
            <CardDescription className="text-gray-700 text-sm mt-1">
              {task.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="p-0 text-center">
          <p className={`text-md font-semibold ${getPriorityColor(displayPriority)}`}>
            Prioridade: {getPriorityLabel(displayPriority)}
          </p>
          {task.due?.date && (
            <p className="text-xs text-gray-500 mt-1">
              Vencimento: <span className="font-medium text-gray-700">{formatDueDate(task.due.date)}</span>
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-100 p-4">
        <p className="text-lg text-blue-600">Carregando tarefas...</p>
      </div>
    );
  }

  const currentOpponent = currentOpponentIndex !== null ? rankedTasks[currentOpponentIndex] : null;

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
          <div className="w-20"></div>
        </div>
        <p className="text-xl text-blue-700 text-center mb-8">
          Priorize suas tarefas com torneio
        </p>
      </div>

      <Card className="w-full max-w-md shadow-lg bg-white/80 backdrop-blur-sm p-6">
        {currentStep === 'tournamentComparison' && currentChallenger && currentOpponent && currentOpponentIndex !== null && (
          <div className="space-y-6 text-center">
            <CardTitle className="text-2xl font-bold text-gray-800">Qual é mais importante?</CardTitle>
            <CardDescription className="text-lg text-gray-700">
              Escolha a tarefa que você considera mais prioritária.
            </CardDescription>
            <div className="grid grid-cols-1 gap-4">
              {renderTaskCard(currentChallenger, "Tarefa A", "Challenger", currentChallenger.priority)}
              <p className="text-xl font-bold text-gray-700">VS</p>
              {renderTaskCard(currentOpponent, "Tarefa B", `Posição ${currentOpponentIndex + 1} no Ranking`, currentOpponent.priority)}
            </div>
            <div className="flex justify-center space-x-4 mt-6">
              <Button onClick={() => handleTournamentComparison(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-md transition-colors flex items-center">
                <ChevronLeft className="mr-2 h-5 w-5" /> ESCOLHER ESQUERDA (1)
              </Button>
              <Button onClick={() => handleTournamentComparison(false)} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-md transition-colors flex items-center">
                ESCOLHER DIREITA (2) <ChevronRight className="ml-2 h-5 w-5" />
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

            {rankedTasks.slice(0, 4).length > 0 && (
              <div className="text-left p-4 border rounded-md bg-red-50/50">
                <h3 className="text-xl font-bold text-red-700 mb-2">P1 (Urgente)</h3>
                <ul className="list-disc list-inside space-y-1">
                  {rankedTasks.slice(0, 4).map((task) => (
                    <li key={task.id} className="text-gray-800">{task.content}</li>
                  ))}
                </ul>
              </div>
            )}

            {rankedTasks.slice(4, RANKING_SIZE).length > 0 && (
              <div className="text-left p-4 border rounded-md bg-yellow-50/50">
                <h3 className="text-xl font-bold text-yellow-700 mb-2">P2 (Alta)</h3>
                <ul className="list-disc list-inside space-y-1">
                  {rankedTasks.slice(4, RANKING_SIZE).map((task) => (
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

            {allFetchedTasks.length === 0 && (
              <p className="text-gray-600">Nenhuma tarefa para priorizar. Bom trabalho!</p>
            )}

            <Button onClick={() => navigate("/main-menu")} className="mt-6 bg-blue-600 hover:bg-blue-700">
              Voltar ao Menu Principal
            </Button>
          </div>
        )}

        {currentStep !== 'loading' && !currentChallenger && tournamentQueue.length === 0 && currentStep !== 'result' && (
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
      
      <div className="mt-8 w-full max-w-3xl">
        <Button
          variant="outline"
          onClick={() => setShowDebugPanel(!showDebugPanel)}
          className="flex items-center gap-2 text-gray-700 hover:text-gray-900 border-gray-300 hover:border-gray-400 bg-white/70 backdrop-blur-sm"
        >
          <Bug size={20} /> {showDebugPanel ? "Esconder Debug" : "Mostrar Debug"}
        </Button>

        {showDebugPanel && (
          <Card className="mt-4 p-4 shadow-lg bg-white/90 backdrop-blur-sm text-left text-sm">
            <CardTitle className="text-xl font-bold mb-3">Painel de Debug</CardTitle>
            <div className="space-y-3">
              <p><strong>Current Step:</strong> {currentStep}</p>
              <p><strong>Current Challenger:</strong> {currentChallenger ? `${currentChallenger.content} (ID: ${currentChallenger.id}, Prio: ${currentChallenger.priority})` : "Nenhum"}</p>
              <p><strong>Current Opponent Index:</strong> {currentOpponentIndex !== null ? currentOpponentIndex : "Nenhum"}</p>

              <div>
                <h4 className="font-semibold mt-2">Tournament Queue ({tournamentQueue.length} tasks):</h4>
                <ul className="list-disc list-inside ml-4">
                  {tournamentQueue.map(task => (
                    <li key={task.id}>{task.content} (ID: {task.id}, Prio: {task.priority})</li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mt-2">Ranked Tasks ({rankedTasks.length} tasks):</h4>
                <ul className="list-disc list-inside ml-4">
                  {rankedTasks.map(task => (
                    <li key={task.id}>{task.content} (ID: {task.id}, Prio: {task.priority})</li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mt-2">P3 Tasks ({p3Tasks.length} tasks):</h4>
                <ul className="list-disc list-inside ml-4">
                  {p3Tasks.map(task => (
                    <li key={task.id}>{task.content} (ID: {task.id}, Prio: {task.priority})</li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        )}
      </div>
      <MadeWithDyad />
    </div>
  );
};

export default SEITONPage;