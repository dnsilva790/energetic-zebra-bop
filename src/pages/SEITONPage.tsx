"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Check, X, ExternalLink, Repeat, Play, ChevronLeft, ChevronRight } from "lucide-react";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { showSuccess, showError } from "@/utils/toast";
import { getTasks, completeTask, updateTask, handleApiCall } from "@/lib/todoistApi";
import { TodoistTask } from "@/lib/types";
import { shouldExcludeTaskFromTriage } from "@/utils/taskFilters";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as dateFnsTz from "date-fns-tz";

const BRASILIA_TIMEZONE = 'America/Sao_Paulo'; // Fuso horário de Brasília
const RANKING_SIZE = 24; // P1 (4) + P2 (20)
const SEITON_PROGRESS_KEY = 'seiton_progress';

type SeitonStep = 'loading' | 'threeMinFilter' | 'executeNow' | 'tournamentComparison' | 'result';

interface SeitonProgress {
  threeMinFilterQueue: TodoistTask[];
  tournamentQueue: TodoistTask[];
  rankedTasks: TodoistTask[];
  p3Tasks: TodoistTask[];
  currentStep: SeitonStep;
  currentThreeMinTask: TodoistTask | null;
  currentChallenger: TodoistTask | null;
  currentOpponentIndex: number | null;
}

const SEITONPage = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<SeitonStep>('loading');
  const [allFetchedTasks, setAllFetchedTasks] = useState<TodoistTask[]>([]); // All tasks from Todoist
  const [threeMinFilterQueue, setThreeMinFilterQueue] = useState<TodoistTask[]>([]); // Tasks for 3-min filter
  const [tournamentQueue, setTournamentQueue] = useState<TodoistTask[]>([]); // Tasks waiting to enter tournament
  const [rankedTasks, setRankedTasks] = useState<TodoistTask[]>([]); // Top 24 tasks (P1/P2)
  const [p3Tasks, setP3Tasks] = useState<TodoistTask[]>([]); // Tasks that are P3
  
  const [currentThreeMinTask, setCurrentThreeMinTask] = useState<TodoistTask | null>(null);
  const [currentChallenger, setCurrentChallenger] = useState<TodoistTask | null>(null);
  const [currentOpponentIndex, setCurrentOpponentIndex] = useState<number | null>(null);
  
  const [loading, setLoading] = useState(true);

  // Debug: Log component mount
  useEffect(() => {
    console.log("SEITONPage mounted.");
    return () => console.log("SEITONPage unmounted.");
  }, []);

  // Debug: Log current step changes
  useEffect(() => {
    console.log("SEITONPage - currentStep changed to:", currentStep);
    console.log("SEITONPage - currentThreeMinTask:", currentThreeMinTask?.content);
    console.log("SEITONPage - currentChallenger:", currentChallenger?.content);
    console.log("SEITONPage - currentOpponentIndex:", currentOpponentIndex);
    console.log("SEITONPage - rankedTasks length:", rankedTasks.length);
    console.log("SEITONPage - p3Tasks length:", p3Tasks.length);
  }, [currentStep, currentThreeMinTask, currentChallenger, currentOpponentIndex, rankedTasks.length, p3Tasks.length]);

  /**
   * Formats a date string, handling potential time components and invalid dates.
   * Assumes Todoist dates are UTC (UTC 0) and converts them to Brasília timezone (UTC-3).
   * Displays time (HH:mm) if present in the original date string.
   * @param dateString The date string from Todoist API (e.g., "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:SSZ").
   * @returns Formatted date string (e.g., "dd/MM/yyyy HH:mm") or "Sem vencimento" / "Data inválida" / "Erro de data".
   */
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
      threeMinFilterQueue,
      tournamentQueue,
      rankedTasks,
      p3Tasks,
      currentStep,
      currentThreeMinTask,
      currentChallenger,
      currentOpponentIndex,
    };
    localStorage.setItem(SEITON_PROGRESS_KEY, JSON.stringify(progress));
    console.log("SEITONPage - Progress saved:", progress);
  }, [threeMinFilterQueue, tournamentQueue, rankedTasks, p3Tasks, currentStep, currentThreeMinTask, currentChallenger, currentOpponentIndex]);

  const loadProgress = useCallback(() => {
    const savedProgress = localStorage.getItem(SEITON_PROGRESS_KEY);
    if (savedProgress) {
      const progress: SeitonProgress = JSON.parse(savedProgress);
      setThreeMinFilterQueue(progress.threeMinFilterQueue);
      setTournamentQueue(progress.tournamentQueue);
      setRankedTasks(progress.rankedTasks);
      setP3Tasks(progress.p3Tasks);
      setCurrentStep(progress.currentStep);
      setCurrentThreeMinTask(progress.currentThreeMinTask);
      setCurrentChallenger(progress.currentChallenger);
      setCurrentOpponentIndex(progress.currentOpponentIndex);
      console.log("SEITONPage - Progress loaded:", progress);
      return true;
    }
    return false;
  }, []);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    console.log("SEITONPage - fetchTasks: Starting API call to get tasks.");
    const fetchedTasks = await handleApiCall(getTasks, "Carregando tarefas...");
    if (fetchedTasks) {
      const filteredTasks = fetchedTasks
        .filter((task: TodoistTask) => !shouldExcludeTaskFromTriage(task))
        .filter((task: TodoistTask) => !task.is_completed); // Only active tasks

      console.log("SEITONPage - fetchTasks: Filtered tasks count:", filteredTasks.length);
      setAllFetchedTasks(filteredTasks);

      const hasLoadedProgress = loadProgress();

      if (!hasLoadedProgress) {
        if (filteredTasks.length === 0) {
          showSuccess("Nenhuma tarefa ativa para planejar hoje. Bom trabalho!");
          setThreeMinFilterQueue([]);
          setCurrentStep('result');
          console.log("SEITONPage - fetchTasks: No tasks found, setting step to 'result'.");
        } else {
          setThreeMinFilterQueue([...filteredTasks]); // All tasks initially go to 3-min filter
          setCurrentThreeMinTask(filteredTasks[0] || null);
          setCurrentStep('threeMinFilter');
          console.log("SEITONPage - fetchTasks: Tasks found, setting step to 'threeMinFilter'.");
        }
      } else {
        // If progress was loaded, we need to check for new tasks that weren't in the previous session
        const processedTaskIds = new Set([
          ...threeMinFilterQueue.map(t => t.id),
          ...tournamentQueue.map(t => t.id),
          ...rankedTasks.map(t => t.id),
          ...p3Tasks.map(t => t.id),
          ...(currentThreeMinTask ? [currentThreeMinTask.id] : []),
          ...(currentChallenger ? [currentChallenger.id] : []),
        ]);

        const newTasks = filteredTasks.filter(task => !processedTaskIds.has(task.id));
        if (newTasks.length > 0) {
          setThreeMinFilterQueue(prev => [...prev, ...newTasks]);
          if (!currentThreeMinTask && currentStep !== 'threeMinFilter') {
            setCurrentThreeMinTask(newTasks[0]);
            setCurrentStep('threeMinFilter');
          }
          showSuccess(`${newTasks.length} novas tarefas adicionadas para triagem.`);
        } else if (threeMinFilterQueue.length === 0 && tournamentQueue.length === 0 && currentStep !== 'result') {
          // If no new tasks and all queues are empty, and not already in result, move to result
          setCurrentStep('result');
        }
      }
    } else {
      showError("Não foi possível carregar as tarefas do Todoist.");
      navigate("/main-menu");
      console.error("SEITONPage - fetchTasks: Failed to load tasks, navigating to main menu.");
    }
    setLoading(false);
    console.log("SEITONPage - fetchTasks: Finished loading tasks.");
  }, [navigate, loadProgress, threeMinFilterQueue, tournamentQueue, rankedTasks, p3Tasks, currentThreeMinTask, currentChallenger, currentStep]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Save progress whenever relevant state changes
  useEffect(() => {
    if (!loading) {
      saveProgress();
    }
  }, [threeMinFilterQueue, tournamentQueue, rankedTasks, p3Tasks, currentStep, currentThreeMinTask, currentChallenger, currentOpponentIndex, loading, saveProgress]);

  // --- Tournament Logic ---
  const startNextTournamentComparison = useCallback(() => {
    if (tournamentQueue.length === 0) {
      setCurrentStep('result');
      localStorage.removeItem(SEITON_PROGRESS_KEY); // Clear progress when done
      return;
    }

    const nextChallenger = tournamentQueue[0]; // Peek at the first task in queue
    setCurrentChallenger(nextChallenger);

    if (rankedTasks.length === 0) {
      // If ranking is empty, just add the first challenger
      setRankedTasks(prev => {
        const newRanked = [...prev, nextChallenger];
        setTournamentQueue(prevQueue => prevQueue.slice(1)); // Remove from queue
        setCurrentChallenger(null); // Challenger found its place
        return newRanked;
      });
      // Immediately try to start next comparison if there are more tasks
      // This will be handled by the useEffect below that watches tournamentQueue/currentChallenger
      return;
    }

    // Challenger will dispute with the last task in the ranked list (or 24th position)
    const opponentIndex = Math.min(RANKING_SIZE - 1, rankedTasks.length - 1);
    setCurrentOpponentIndex(opponentIndex);
    setCurrentStep('tournamentComparison');
  }, [tournamentQueue, rankedTasks]);

  // Effect to manage the flow of tournament comparisons
  useEffect(() => {
    if (currentStep === 'tournamentComparison' && !currentChallenger && tournamentQueue.length > 0) {
      // If a comparison just finished and there are more tasks in queue, start next
      startNextTournamentComparison();
    } else if (currentStep === 'threeMinFilter' && !currentThreeMinTask && threeMinFilterQueue.length > 0) {
      // If 3-min filter task finished, get next
      setCurrentThreeMinTask(threeMinFilterQueue[0] || null);
    } else if (currentStep === 'threeMinFilter' && !currentThreeMinTask && threeMinFilterQueue.length === 0 && tournamentQueue.length > 0) {
      // All 3-min tasks processed, move to tournament
      setCurrentStep('tournamentComparison');
      startNextTournamentComparison();
    } else if (currentStep === 'threeMinFilter' && !currentThreeMinTask && threeMinFilterQueue.length === 0 && tournamentQueue.length === 0) {
      // All tasks processed, no more in queue, move to result
      setCurrentStep('result');
      localStorage.removeItem(SEITON_PROGRESS_KEY); // Clear progress when done
    }
  }, [currentStep, currentChallenger, currentThreeMinTask, threeMinFilterQueue, tournamentQueue, startNextTournamentComparison]);


  const handleThreeMinFilter = useCallback((isLessThanThreeMin: boolean) => {
    if (!currentThreeMinTask) return;

    const remainingThreeMinTasks = threeMinFilterQueue.slice(1);
    setThreeMinFilterQueue(remainingThreeMinTasks);

    if (isLessThanThreeMin) {
      setCurrentStep('executeNow');
    } else {
      setTournamentQueue(prev => [...prev, currentThreeMinTask]);
      setCurrentThreeMinTask(remainingThreeMinTasks[0] || null);
      setCurrentStep('threeMinFilter'); // Stay in 3-min filter for next task
    }
  }, [currentThreeMinTask, threeMinFilterQueue]);

  const handleExecuteNow = useCallback(async (executed: boolean) => {
    if (!currentThreeMinTask) return;

    const remainingThreeMinTasks = threeMinFilterQueue.slice(1);
    setThreeMinFilterQueue(remainingThreeMinTasks);

    if (executed) {
      const success = await handleApiCall(() => completeTask(currentThreeMinTask.id), "Concluindo tarefa...", "Tarefa executada e concluída!");
      if (!success) {
        showError("Falha ao concluir a tarefa.");
      }
    } else {
      showSuccess("Tarefa não executada, entrará no torneio.");
      setTournamentQueue(prev => [...prev, currentThreeMinTask]);
    }
    setCurrentThreeMinTask(remainingThreeMinTasks[0] || null);
    setCurrentStep('threeMinFilter'); // Return to 3-min filter for the next task
  }, [currentThreeMinTask, threeMinFilterQueue]);

  const handleTournamentComparison = useCallback(async (challengerWins: boolean) => {
    if (!currentChallenger || currentOpponentIndex === null) return;

    const opponentTask = rankedTasks[currentOpponentIndex];
    let newRankedTasks = [...rankedTasks];
    let newP3Tasks = [...p3Tasks];
    let nextOpponentIndex: number | null = null;

    if (challengerWins) {
      // Challenger wins, it climbs
      newRankedTasks.splice(currentOpponentIndex, 0, currentChallenger); // Insert challenger
      
      if (newRankedTasks.length > RANKING_SIZE) {
        // If ranking is full, push out the last task to P3
        const pushedOutTask = newRankedTasks.pop();
        if (pushedOutTask) newP3Tasks.push(pushedOutTask);
      }
      
      // Challenger continues to climb, compare with the task above
      nextOpponentIndex = currentOpponentIndex - 1;
      if (nextOpponentIndex < 0) {
        // Challenger reached the top (P1)
        await handleApiCall(() => updateTask(currentChallenger.id, { priority: 4 }), `Definindo prioridade P1 para ${currentChallenger.content}...`);
        setCurrentChallenger(null); // Challenger found its final place
        setCurrentOpponentIndex(null);
        setTournamentQueue(prev => prev.slice(1)); // Remove from queue
      } else {
        // Challenger continues to fight
        setCurrentChallenger(currentChallenger); // Keep challenger
        setCurrentOpponentIndex(nextOpponentIndex);
      }
    } else {
      // Opponent wins, challenger loses
      if (newRankedTasks.length < RANKING_SIZE) {
        // If ranking is not full, add challenger to the end
        newRankedTasks.push(currentChallenger);
      } else {
        // If ranking is full, challenger becomes P3
        newP3Tasks.push(currentChallenger);
      }
      // Challenger found its place (or P3), get next from queue
      setCurrentChallenger(null);
      setCurrentOpponentIndex(null);
      setTournamentQueue(prev => prev.slice(1)); // Remove from queue
    }

    setRankedTasks(newRankedTasks);
    setP3Tasks(newP3Tasks);

    // Update priorities for tasks in rankedTasks (P1, P2) and P3
    // This could be optimized to only update changed tasks, but for simplicity, re-evaluate all.
    const updatePriorities = async (tasks: TodoistTask[], targetPriority: number) => {
      for (const task of tasks) {
        if (task.priority !== targetPriority) {
          await handleApiCall(() => updateTask(task.id, { priority: targetPriority }), `Atualizando prioridade para ${task.content}...`);
        }
      }
    };

    // Update priorities based on their final position in the ranked list
    const p1Tasks = newRankedTasks.slice(0, 4);
    const p2Tasks = newRankedTasks.slice(4, RANKING_SIZE);

    await updatePriorities(p1Tasks, 4); // P1
    await updatePriorities(p2Tasks, 3); // P2
    await updatePriorities(newP3Tasks, 2); // P3

    if (!currentChallenger && tournamentQueue.length === 0 && nextOpponentIndex === null) {
      setCurrentStep('result');
      localStorage.removeItem(SEITON_PROGRESS_KEY); // Clear progress when done
    } else if (!currentChallenger && tournamentQueue.length > 0) {
      startNextTournamentComparison(); // Start next comparison if challenger found its place
    }
  }, [currentChallenger, currentOpponentIndex, rankedTasks, p3Tasks, tournamentQueue, startNextTournamentComparison]);


  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (loading) return;

      if (currentStep === 'threeMinFilter' && currentThreeMinTask) {
        if (event.key === 's' || event.key === 'S') {
          event.preventDefault();
          handleThreeMinFilter(true);
        } else if (event.key === 'n' || event.key === 'N') {
          event.preventDefault();
          handleThreeMinFilter(false);
        }
      } else if (currentStep === 'executeNow' && currentThreeMinTask) {
        if (event.key === 'e' || event.key === 'E') {
          event.preventDefault();
          handleExecuteNow(true);
        } else if (event.key === 'x' || event.key === 'X') {
          event.preventDefault();
          handleExecuteNow(false);
        }
      } else if (currentStep === 'tournamentComparison' && currentChallenger && currentOpponentIndex !== null) {
        if (event.key === '1') { // Challenger wins
          event.preventDefault();
          handleTournamentComparison(true);
        } else if (event.key === '2') { // Opponent wins
          event.preventDefault();
          handleTournamentComparison(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [loading, currentStep, currentThreeMinTask, currentChallenger, currentOpponentIndex, handleThreeMinFilter, handleExecuteNow, handleTournamentComparison]);

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
        {currentStep === 'threeMinFilter' && currentThreeMinTask && (
          <div className="space-y-6 text-center">
            <CardTitle className="text-2xl font-bold text-gray-800">Filtro de 3 minutos</CardTitle>
            <CardDescription className="text-lg text-gray-700">
              Esta tarefa leva menos de 3 minutos?
            </CardDescription>
            {renderTaskCard(currentThreeMinTask, "Tarefa Atual", "Esta tarefa leva menos de 3 minutos?")}
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

        {currentStep === 'executeNow' && currentThreeMinTask && (
          <div className="space-y-6 text-center">
            <CardTitle className="text-2xl font-bold text-gray-800">Execute agora!</CardTitle>
            <CardDescription className="text-lg text-gray-700">
              Tarefa: {currentThreeMinTask.content}
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

        {/* Fallback for when no tasks are found or processed */}
        {currentStep !== 'loading' && !currentThreeMinTask && !currentChallenger && tournamentQueue.length === 0 && threeMinFilterQueue.length === 0 && currentStep !== 'result' && (
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