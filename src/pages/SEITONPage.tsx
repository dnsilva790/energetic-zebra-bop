"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
// Removendo importações de date-fns-tz para usar o fuso horário local do navegador

const RANKING_SIZE = 24; // P1 (4) + P2 (20)
const SEITON_PROGRESS_KEY = 'seiton_progress';
const SEITON_LAST_RANKING_KEY = 'seiton_last_ranking'; // Nova chave para o último ranking

type SeitonStep = 'loading' | 'tournamentComparison' | 'result';

interface SeitonProgress {
  tournamentQueue: TodoistTask[];
  rankedTasks: TodoistTask[];
  p3Tasks: TodoistTask[];
  currentStep: SeitonStep;
  currentChallenger: TodoistTask | null;
  currentOpponentIndex: number | null;
  comparisonHistory: ComparisonEntry[]; // Adicionado ao progresso salvo
}

interface ComparisonEntry {
  challengerContent: string;
  opponentContent: string;
  winner: 'challenger' | 'opponent';
  action: string;
  timestamp: string;
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
  const [comparisonHistory, setComparisonHistory] = useState<ComparisonEntry[]>([]); // Novo estado para histórico
  
  const [loading, setLoading] = useState(true);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  useEffect(() => {
    console.log("SEITONPage mounted.");
    return () => console.log("SEITONPage unmounted.");
  }, []);

  useEffect(() => {
    console.log("SEITONPage - currentStep changed to:", currentStep);
    console.log("SEITONPage - currentChallenger:", currentChallenger?.content || "Nenhum");
    console.log("SEITONPage - currentOpponentIndex:", currentOpponentIndex);
    console.log("SEITONPage - rankedTasks length:", rankedTasks.length, "Contents:", rankedTasks.map(t => `${t.content} (Prio: ${t.priority})`));
    console.log("SEITONPage - p3Tasks length:", p3Tasks.length, "Contents:", p3Tasks.map(t => `${t.content} (Prio: ${t.priority})`));
    console.log("SEITONPage - tournamentQueue length:", tournamentQueue.length, "Contents:", tournamentQueue.map(t => `${t.content} (Prio: ${t.priority})`));
  }, [currentStep, currentChallenger, currentOpponentIndex, rankedTasks, p3Tasks, tournamentQueue]);

  const formatDueDate = (dateString: string | undefined | null) => {
    if (!dateString) return "Sem vencimento";
    
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

      // Use regex to robustly check for a time pattern (HH:MM) in the date string
      const hasTime = /\d{2}:\d{2}/.test(dateString);
      const formatString = hasTime ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy";

      return format(parsedDate, formatString, { locale: ptBR });
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
      comparisonHistory, // Salvar histórico
    };
    localStorage.setItem(SEITON_PROGRESS_KEY, JSON.stringify(progress));
    console.log("SEITONPage - Progress saved:", progress);
  }, [tournamentQueue, rankedTasks, p3Tasks, currentStep, currentChallenger, currentOpponentIndex, comparisonHistory]);

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
    try {
      const fetchedTasks = await handleApiCall(getTasks, "Carregando tarefas...");
      if (!fetchedTasks) {
        showError("Não foi possível carregar as tarefas do Todoist.");
        navigate("/main-menu");
        return;
      }

      // Filtra tarefas para incluir apenas as ATIVAS e não excluídas
      const activeTasks = fetchedTasks
        .filter((task: TodoistTask) => !shouldExcludeTaskFromTriage(task))
        .filter((task: TodoistTask) => !(task as any).is_completed && !(task as any).completed) // Filtro robusto
        .sort((a, b) => b.priority - a.priority); // Ordenar por prioridade (P4 primeiro)
      console.log("SEITONPage - Active tasks from API (sorted by priority):", activeTasks.map(t => `${t.content} (Prio: ${t.priority})`));

      setAllFetchedTasks(activeTasks);

      const savedProgress = loadProgress();

      let currentTournamentQueue: TodoistTask[] = [];
      let currentRankedTasks: TodoistTask[] = [];
      let currentP3Tasks: TodoistTask[] = [];
      let currentChallenger: TodoistTask | null = null;
      let currentOpponentIndex: number | null = null;
      let currentStepState: SeitonStep = 'loading';
      let currentComparisonHistory: ComparisonEntry[] = [];

      if (savedProgress) {
        currentTournamentQueue = savedProgress.tournamentQueue;
        currentRankedTasks = savedProgress.rankedTasks;
        currentP3Tasks = savedProgress.p3Tasks;
        currentChallenger = savedProgress.currentChallenger;
        currentOpponentIndex = savedProgress.currentOpponentIndex;
        currentStepState = savedProgress.currentStep;
        currentComparisonHistory = savedProgress.comparisonHistory || []; // Carregar histórico
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
      setComparisonHistory(currentComparisonHistory); // Definir histórico

      if (currentTournamentQueue.length === 0 && currentRankedTasks.length === 0 && currentP3Tasks.length === 0) {
        showSuccess("Nenhuma tarefa ativa para planejar hoje. Bom trabalho!");
        setCurrentStep('result');
        localStorage.removeItem(SEITON_PROGRESS_KEY);
      } else if (currentStepState === 'loading' && currentTournamentQueue.length > 0) {
        setCurrentStep('tournamentComparison');
      }
    } catch (error) {
      console.error("SEITONPage - Uncaught error in fetchAndSetupTasks:", error);
      showError("Ocorreu um erro inesperado ao carregar as tarefas.");
      navigate("/main-menu");
    } finally {
      setLoading(false);
    }
  }, [navigate, loadProgress]);

  useEffect(() => {
    fetchAndSetupTasks();
  }, [fetchAndSetupTasks]);

  const updateTaskAndReturn = useCallback(async (task: TodoistTask, newPriority: number): Promise<TodoistTask> => {
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
  }, []);

  useEffect(() => {
    if (!loading) {
      saveProgress();
    }
  }, [tournamentQueue, rankedTasks, p3Tasks, currentStep, currentChallenger, currentOpponentIndex, loading, saveProgress]);

  const startNextTournamentComparison = useCallback(async () => {
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
      const updatedChallenger = await updateTaskAndReturn(nextChallenger, 4); // Default to P1 if first task
      setRankedTasks(prev => [...prev, updatedChallenger]);
      setTournamentQueue(prevQueue => prevQueue.slice(1));
      setCurrentChallenger(null);
      return;
    }

    const opponentIndex = Math.min(RANKING_SIZE - 1, rankedTasks.length - 1);
    setCurrentOpponentIndex(opponentIndex);
    setCurrentStep('tournamentComparison');
    console.log("SEITONPage - Starting comparison. Opponent Index:", opponentIndex, "Opponent:", rankedTasks[opponentIndex]?.content);
  }, [tournamentQueue, rankedTasks, updateTaskAndReturn]);

  useEffect(() => {
    console.log("SEITONPage - Flow management effect triggered. Current step:", currentStep);
    const handleFlow = async () => { // Make this async
      if (currentStep === 'tournamentComparison' && !currentChallenger && tournamentQueue.length > 0) {
        console.log("SEITONPage - Flow: Starting next tournament comparison.");
        await startNextTournamentComparison(); // Await the async call
      } else if (currentStep === 'tournamentComparison' && !currentChallenger && tournamentQueue.length === 0) {
        console.log("SEITONPage - Flow: Tournament queue exhausted, moving to result.");
        setCurrentStep('result');
        localStorage.removeItem(SEITON_PROGRESS_KEY);
      } else if (currentStep === 'loading' && tournamentQueue.length > 0) {
        console.log("SEITONPage - Flow: Loaded with tasks in queue, starting tournament.");
        setCurrentStep('tournamentComparison');
        await startNextTournamentComparison(); // Await the async call
      } else if (currentStep === 'loading' && tournamentQueue.length === 0 && allFetchedTasks.length === 0) {
        console.log("SEITONPage - Flow: No tasks at all, moving to result.");
        setCurrentStep('result');
        localStorage.removeItem(SEITON_PROGRESS_KEY);
      }
    };
    handleFlow();
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
    let actionDescription = "";

    // Ensure challenger is not already in rankedTasks or p3Tasks to prevent duplicates
    newRankedTasks = newRankedTasks.filter(t => t.id !== currentChallenger.id);
    newP3Tasks = newP3Tasks.filter(t => t.id !== currentChallenger.id);

    let challengerFinished = false; // Flag to indicate if challenger has found its final place

    if (challengerWins) {
      console.log("SEITONPage - Challenger wins, attempting to move up.");
      newRankedTasks.splice(currentOpponentIndex, 0, currentChallenger); // Insert challenger at current opponent's position

      // Handle overflow if ranked list is full
      if (newRankedTasks.length > RANKING_SIZE) {
        const pushedOutTask = newRankedTasks.pop(); // Remove the last task
        if (pushedOutTask) {
          const updatedPushedOutTask = await updateTaskAndReturn(pushedOutTask, 2); // Set priority to P3
          newP3Tasks.push(updatedPushedOutTask);
          actionDescription += ` Tarefa "${pushedOutTask.content}" movida para P3.`;
          console.log(`SEITONPage - Ranked list full, pushed out ${pushedOutTask.content} to P3.`);
        }
      }
      
      const nextOpponentIndexCandidate = currentOpponentIndex - 1;
      if (nextOpponentIndexCandidate < 0) {
        console.log("SEITONPage - Challenger reached top (P1).");
        actionDescription += ` Desafiante "${currentChallenger.content}" alcançou P1.`;
        challengerFinished = true;
      } else {
        console.log(`SEITONPage - Challenger continues to fight, next opponent index: ${nextOpponentIndexCandidate}`);
        setCurrentOpponentIndex(nextOpponentIndexCandidate); // Challenger moves up
        actionDescription += ` Desafiante "${currentChallenger.content}" inserido na posição ${currentOpponentIndex + 1} e continua a lutar contra "${newRankedTasks[nextOpponentIndexCandidate]?.content || 'o topo'}".`;
      }
    } else { // Challenger loses
      console.log("SEITONPage - Opponent wins, challenger loses. Placing challenger below opponent.");
      
      // Insert challenger immediately after the opponent
      newRankedTasks.splice(currentOpponentIndex + 1, 0, currentChallenger);
      actionDescription = `Oponente "${opponentTask.content}" venceu. Desafiante "${currentChallenger.content}" inserido abaixo do oponente.`;

      // Handle overflow if ranked list is full after insertion
      if (newRankedTasks.length > RANKING_SIZE) {
        const pushedOutTask = newRankedTasks.pop(); // Remove the last task
        if (pushedOutTask) {
          const updatedPushedOutTask = await updateTaskAndReturn(pushedOutTask, 2); // Set priority to P3
          newP3Tasks.push(updatedPushedOutTask);
          actionDescription += ` Tarefa "${pushedOutTask.content}" movida para P3.`;
          console.log(`SEITONPage - Ranked list full, pushed out ${pushedOutTask.content} to P3.`);
        }
      }
      challengerFinished = true;
    }

    // --- Batch update priorities based on final list positions ---
    console.log("SEITONPage - Re-evaluating priorities for remaining ranked tasks.");
    
    const finalRankedTasksPromises = newRankedTasks.map(async (task, index) => {
        let targetPriority = 2; // Default to P3 (priority 2)
        if (index < 4) { // Top 4 are P1
            targetPriority = 4;
        } else if (index < RANKING_SIZE) { // Next 20 are P2
            targetPriority = 3;
        }
        return updateTaskAndReturn(task, targetPriority);
    });

    const finalP3TasksPromises = newP3Tasks.map(task => updateTaskAndReturn(task, 2)); // Ensure all P3 tasks are P3

    const [resolvedRankedTasks, resolvedP3Tasks] = await Promise.all([
        Promise.all(finalRankedTasksPromises),
        Promise.all(finalP3TasksPromises)
    ]);

    newRankedTasks = resolvedRankedTasks.filter(Boolean) as TodoistTask[];
    newP3Tasks = resolvedP3Tasks.filter(Boolean) as TodoistTask[];

    // Log final state of lists before setting state
    console.log("SEITONPage - Final state of lists before setting state:");
    console.log("  newRankedTasks (contents):", newRankedTasks.map(t => `${t.content} (Prio: ${t.priority})`));
    console.log("  newP3Tasks (contents):", newP3Tasks.map(t => `${t.content} (Prio: ${t.priority})`));

    setRankedTasks(newRankedTasks);
    setP3Tasks(newP3Tasks);

    // Record comparison history
    setComparisonHistory(prevHistory => [
      {
        challengerContent: currentChallenger.content,
        opponentContent: opponentTask.content,
        winner: challengerWins ? 'challenger' : 'opponent',
        action: actionDescription,
        timestamp: format(new Date(), "HH:mm:ss", { locale: ptBR }),
      },
      ...prevHistory,
    ].slice(0, 3)); // Manter apenas as 3 últimas

    console.log("SEITONPage - After comparison. New Ranked:", newRankedTasks.map(t => t.content), "New P3:", newP3Tasks.map(t => t.content));

    if (challengerFinished) {
      console.log("SEITONPage - Challenger finished its journey. Moving to next challenger from queue.");
      setCurrentChallenger(null);
      setCurrentOpponentIndex(null);
      setTournamentQueue(prev => prev.slice(1)); // Remove from queue
    }
    // If challengerFinished is false, it means the challenger is still fighting,
    // so currentChallenger and currentOpponentIndex are already updated for the next round.
    
    // Check if tournament is completely finished
    if (tournamentQueue.length === 0 && currentChallenger === null) {
      console.log("SEITONPage - Tournament finished, moving to result.");
      setCurrentStep('result');
      localStorage.removeItem(SEITON_PROGRESS_KEY);
    }
  }, [currentChallenger, currentOpponentIndex, rankedTasks, p3Tasks, tournamentQueue, updateTaskAndReturn]);

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

  // Effect to save final ranking when currentStep becomes 'result'
  useEffect(() => {
    if (currentStep === 'result') {
      const finalRanking = {
        rankedTasks: rankedTasks,
        p3Tasks: p3Tasks,
      };
      localStorage.setItem(SEITON_LAST_RANKING_KEY, JSON.stringify(finalRanking));
      console.log("SEITONPage - Final ranking saved:", finalRanking);
    }
  }, [currentStep, rankedTasks, p3Tasks]);

  // Lógica de seleção da tarefa para o Card de Foco (SEISO)
  const selectedTask = useMemo(() => {
      if (!rankedTasks || rankedTasks.length === 0) {
          return null;
      }
      
      // O SEISO encontra a primeira tarefa com maior ranking que AINDA ESTÁ ATIVA.
      const activeTask = rankedTasks.find(task => 
          // Verifica se as flags de conclusão (is_completed ou completed) não estão marcadas.
          !task.is_completed && !task.completed
      );
      
      // Retorna a tarefa ativa de maior prioridade, ou nulo se todas estiverem concluídas.
      return activeTask || null; 
  }, [rankedTasks]);


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
                    <li key={task.id}>{task.content}</li>
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
              <p><strong>Selected Task (for SEISO Card):</strong> {selectedTask ? `${selectedTask.content} (ID: ${selectedTask.id}, Prio: ${selectedTask.priority})` : "Nenhum"}</p>

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
                  {p3Tasks.map((task) => (
                    <li key={task.id}>{task.content} (ID: {task.id}, Prio: {task.priority})</li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mt-2">Histórico de Comparações (Últimas 3):</h4>
                {comparisonHistory.length > 0 ? (
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    {comparisonHistory.map((entry, index) => (
                      <li key={index}>
                        <span className="font-medium">[{entry.timestamp}]</span> Desafiante: "{entry.challengerContent}" vs. Oponente: "{entry.opponentContent}". Vencedor: {entry.winner}. Ação: {entry.action}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="ml-4 text-gray-500">Nenhuma comparação registrada ainda.</p>
                )}
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