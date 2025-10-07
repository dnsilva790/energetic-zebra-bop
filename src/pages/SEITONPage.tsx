"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { ArrowLeft, Check, X, ExternalLink, Repeat, Play, ChevronLeft, ChevronRight, Bug, Undo2, Clock, RotateCcw, Brain, Loader2, AlertCircle } from "lucide-react";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { showSuccess, showError } from "@/utils/toast";
import { getTasks, completeTask, updateTask, handleApiCall, reopenTask, updateTaskDeadline } from "@/lib/todoistApi";
import { TodoistTask } from "@/lib/types";
import { shouldExcludeTaskFromTriage } from "@/utils/taskFilters";
import { format, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn, formatDateForDisplay } from "@/lib/utils";
import SetDeadlineDialog from "@/components/SetDeadlineDialog";
import { SEITON_PROGRESS_KEY, SEITON_LAST_RANKING_KEY, AI_COMPARISON_SYSTEM_PROMPT_KEY } from "@/lib/constants";

const RANKING_SIZE = 24; // P1 (4) + P2 (20)

type SeitonStep = 'loading' | 'tournamentComparison' | 'result';

interface SeitonProgress {
  tournamentQueue: TodoistTask[];
  rankedTasks: TodoistTask[];
  p3Tasks: TodoistTask[];
  currentStep: SeitonStep;
  currentChallenger: TodoistTask | null;
  currentOpponentIndex: number | null;
  comparisonHistory: ComparisonEntry[];
}

interface ComparisonEntry {
  challengerContent: string;
  opponentContent: string;
  winner: 'challenger' | 'opponent' | 'N/A';
  action: string;
  timestamp: string;
}

interface UndoState {
  type: 'compare' | 'cancel';
  snapshotTournamentQueue: TodoistTask[];
  snapshotRankedTasks: TodoistTask[];
  snapshotP3Tasks: TodoistTask[];
  snapshotCurrentChallenger: TodoistTask | null;
  snapshotCurrentOpponentIndex: number | null;
  cancelledTaskId?: string;
}

const DEFAULT_AI_COMPARISON_PROMPT = `Você é um assistente de produtividade. Dadas duas tarefas, A e B, determine qual delas é mais importante para ser feita primeiro. Considere a prioridade (4=mais alta, 1=mais baixa), data de vencimento, data limite, se é recorrente, e a descrição. Responda com 'A' se a Tarefa A for mais importante, ou 'B' se a Tarefa B for mais importante. Em uma nova linha, forneça uma explicação concisa (1-2 frases) do porquê.
Exemplo:
A
A Tarefa A tem prioridade mais alta e um vencimento mais próximo.
`;

const SEITONPage = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<SeitonStep>('loading');
  const [tournamentQueue, setTournamentQueue] = useState<TodoistTask[]>([]);
  const [rankedTasks, setRankedTasks] = useState<TodoistTask[]>([]);
  const [p3Tasks, setP3Tasks] = useState<TodoistTask[]>([]);
  
  const [currentChallenger, setCurrentChallenger] = useState<TodoistTask | null>(null);
  const [currentOpponentIndex, setCurrentOpponentIndex] = useState<number | null>(null);
  const [comparisonHistory, setComparisonHistory] = useState<ComparisonEntry[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  const [lastUndoableAction, setLastUndoableAction] = useState<UndoState | null>(null);

  const [showSetDeadlineDialog, setShowSetDeadlineDialog] = useState(false);
  const [taskToSetDeadline, setTaskToSetDeadline] = useState<TodoistTask | null>(null);

  const [isAISuggestingComparison, setIsAISuggestingComparison] = useState(false);
  const [aiComparisonSuggestion, setAiComparisonSuggestion] = useState<'A' | 'B' | null>(null);
  const [aiComparisonExplanation, setAiComparisonExplanation] = useState<string | null>(null);
  const [showAiComparisonSuggestion, setShowAiComparisonSuggestion] = useState(false);

  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

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

  const saveProgress = useCallback(() => {
    const progress: SeitonProgress = {
      tournamentQueue,
      rankedTasks,
      p3Tasks,
      currentStep,
      currentChallenger,
      currentOpponentIndex,
      comparisonHistory,
    };
    localStorage.setItem(SEITON_PROGRESS_KEY, JSON.stringify(progress));
    console.log("SEITONPage - Progress saved:", progress);
  }, [tournamentQueue, rankedTasks, p3Tasks, currentStep, currentChallenger, currentOpponentIndex, comparisonHistory]);

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

      const activeTasks = fetchedTasks
        .filter((task: TodoistTask) => !shouldExcludeTaskFromTriage(task))
        .filter((task: TodoistTask) => !task.is_completed && !(task as any).completed)
        .sort((a, b) => {
          if (b.priority !== a.priority) return b.priority - a.priority;
          const deadlineA = a.deadline?.date ? parseISO(a.deadline.date) : null;
          const deadlineB = b.deadline?.date ? parseISO(b.deadline.date) : null;
          const isValidDeadlineA = deadlineA && isValid(deadlineA);
          const isValidDeadlineB = deadlineB && isValid(deadlineB);
          if (isValidDeadlineA && isValidDeadlineB) return deadlineA!.getTime() - deadlineB!.getTime();
          if (isValidDeadlineA) return -1;
          if (isValidDeadlineB) return 1;
          const dateA = a.due?.date ? parseISO(a.due.date) : null;
          const dateB = b.due?.date ? parseISO(b.due.date) : null;
          const isValidDateA = dateA && isValid(dateA);
          const isValidDateB = dateB && isValid(dateB);
          if (isValidDateA && isValidDateB) return dateA!.getTime() - dateB!.getTime();
          if (isValidDateA) return -1;
          if (isValidDateB) return 1;
          return 0;
        });

      const savedProgressRaw = localStorage.getItem(SEITON_PROGRESS_KEY);

      if (savedProgressRaw) {
        const loaded: SeitonProgress = JSON.parse(savedProgressRaw);
        const currentTournamentQueue = loaded.tournamentQueue.filter((task: TodoistTask) => activeTasks.some(at => at.id === task.id));
        const currentRankedTasks = loaded.rankedTasks.filter((task: TodoistTask) => activeTasks.some(at => at.id === task.id));
        const currentP3Tasks = loaded.p3Tasks.filter((task: TodoistTask) => activeTasks.some(at => at.id === task.id));
        const currentChallenger = loaded.currentChallenger && activeTasks.some(at => at.id === loaded.currentChallenger.id) ? loaded.currentChallenger : null;
        const currentComparisonHistory = loaded.comparisonHistory || [];

        setTournamentQueue(currentTournamentQueue);
        setRankedTasks(currentRankedTasks);
        setP3Tasks(currentP3Tasks);
        setCurrentChallenger(currentChallenger);
        setCurrentOpponentIndex(loaded.currentOpponentIndex);
        setCurrentStep(loaded.currentStep);
        setComparisonHistory(currentComparisonHistory);
        setLastUndoableAction(null);

        if (currentTournamentQueue.length === 0 && currentRankedTasks.length === 0 && currentP3Tasks.length === 0 && !currentChallenger) {
          showSuccess("Nenhuma tarefa ativa para planejar hoje. Bom trabalho!");
          setCurrentStep('result');
          localStorage.removeItem(SEITON_PROGRESS_KEY);
        } else if (loaded.currentStep === 'tournamentComparison' && currentChallenger && currentRankedTasks.length > 0) {
          // Ensure opponent index is valid if we're resuming a comparison
          setCurrentOpponentIndex(Math.min(RANKING_SIZE - 1, currentRankedTasks.length - 1));
        }
        console.log("SEITONPage - Loaded saved progress and resumed.");
      } else {
        // No saved progress, start a new tournament
        console.log("SEITONPage - No saved progress, starting new tournament.");
        setTournamentQueue(activeTasks);
        setRankedTasks([]);
        setP3Tasks([]);
        setCurrentChallenger(null);
        setCurrentOpponentIndex(null);
        setComparisonHistory([]);
        setLastUndoableAction(null);
        setCurrentStep('tournamentComparison');
        if (activeTasks.length === 0) {
          showSuccess("Nenhuma tarefa ativa para planejar hoje. Bom trabalho!");
          setCurrentStep('result');
        }
      }
    } catch (error) {
      console.error("SEITONPage - Uncaught error in fetchAndSetupTasks:", error);
      showError("Ocorreu um erro inesperado ao carregar as tarefas.");
      navigate("/main-menu");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

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
    if (!loading) { // Don't save progress during initial AI ranking
      saveProgress();
    }
  }, [tournamentQueue, rankedTasks, p3Tasks, currentStep, currentChallenger, currentOpponentIndex, loading, saveProgress]);

  const startNextTournamentComparison = useCallback(async () => {
    console.log("SEITONPage - startNextTournamentComparison called.");
    setAiComparisonSuggestion(null);
    setAiComparisonExplanation(null);
    setShowAiComparisonSuggestion(false);

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
      const updatedChallenger = await updateTaskAndReturn(nextChallenger, 4);
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
    console.log("SEITONPage - Flow management effect triggered. Current step:", currentStep, "Challenger:", currentChallenger?.content || "Nenhum", "Queue length:", tournamentQueue.length);
    const handleFlow = async () => {
      if (currentStep === 'tournamentComparison' && !currentChallenger && tournamentQueue.length > 0) {
        console.log("SEITONPage - Flow: No current challenger, queue has tasks. Starting next comparison.");
        await startNextTournamentComparison();
      } else if (currentStep === 'tournamentComparison' && !currentChallenger && tournamentQueue.length === 0) {
        console.log("SEITONPage - Flow: No current challenger, queue is empty. Tournament finished.");
        setCurrentStep('result');
      }
    };
    handleFlow();
  }, [currentStep, currentChallenger, tournamentQueue.length, startNextTournamentComparison]);

  const handleTournamentComparison = useCallback(async (challengerWins: boolean) => {
    if (!currentChallenger || currentOpponentIndex === null) {
      console.error("SEITONPage - handleTournamentComparison: Invalid state for comparison.");
      return;
    }

    setLastUndoableAction({
      type: 'compare',
      snapshotTournamentQueue: tournamentQueue,
      snapshotRankedTasks: rankedTasks,
      snapshotP3Tasks: p3Tasks,
      snapshotCurrentChallenger: currentChallenger,
      snapshotCurrentOpponentIndex: currentOpponentIndex,
    });

    console.log(`SEITONPage - handleTournamentComparison: Challenger wins? ${challengerWins}. Challenger: ${currentChallenger.content}, Opponent Index: ${currentOpponentIndex}`);

    const opponentTask = rankedTasks[currentOpponentIndex];
    let newRankedTasks = [...rankedTasks];
    let newP3Tasks = [...p3Tasks];
    let actionDescription = "";

    newRankedTasks = newRankedTasks.filter(t => t.id !== currentChallenger.id);
    newP3Tasks = newP3Tasks.filter(t => t.id !== currentChallenger.id);

    let challengerFinished = false;

    if (challengerWins) {
      console.log("SEITONPage - Challenger wins, attempting to move up.");
      newRankedTasks.splice(currentOpponentIndex, 0, currentChallenger);

      if (newRankedTasks.length > RANKING_SIZE) {
        const pushedOutTask = newRankedTasks.pop();
        if (pushedOutTask) {
          const updatedPushedOutTask = await updateTaskAndReturn(pushedOutTask, 2);
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
        setCurrentOpponentIndex(nextOpponentIndexCandidate);
        actionDescription += ` Desafiante "${currentChallenger.content}" inserido na posição ${currentOpponentIndex + 1} e continua a lutar contra "${newRankedTasks[nextOpponentIndexCandidate]?.content || 'o topo'}".`;
      }
    } else {
      console.log("SEITONPage - Opponent wins, challenger loses. Placing challenger below opponent.");
      
      newRankedTasks.splice(currentOpponentIndex + 1, 0, currentChallenger);
      actionDescription = `Oponente "${opponentTask.content}" venceu. Desafiante "${currentChallenger.content}" inserido abaixo do oponente.`;

      if (newRankedTasks.length > RANKING_SIZE) {
        const pushedOutTask = newRankedTasks.pop();
        if (pushedOutTask) {
          const updatedPushedOutTask = await updateTaskAndReturn(pushedOutTask, 2);
          newP3Tasks.push(updatedPushedOutTask);
          actionDescription += ` Tarefa "${pushedOutTask.content}" movida para P3.`;
          console.log(`SEITONPage - Ranked list full, pushed out ${pushedOutTask.content} to P3.`);
        }
      }
      challengerFinished = true;
    }

    console.log("SEITONPage - Re-evaluating priorities for remaining ranked tasks.");
    
    const finalRankedTasksPromises = newRankedTasks.map(async (task, index) => {
        let targetPriority = 2;
        if (index < 4) {
            targetPriority = 4;
        } else if (index < RANKING_SIZE) {
            targetPriority = 3;
        }
        return updateTaskAndReturn(task, targetPriority);
    });

    const finalP3TasksPromises = newP3Tasks.map(task => updateTaskAndReturn(task, 2));

    const [resolvedRankedTasks, resolvedP3Tasks] = await Promise.all([
        Promise.all(finalRankedTasksPromises),
        Promise.all(finalP3TasksPromises)
    ]);

    newRankedTasks = resolvedRankedTasks.filter(Boolean) as TodoistTask[];
    newP3Tasks = resolvedP3Tasks.filter(Boolean) as TodoistTask[];

    console.log("SEITONPage - Final state of lists before setting state:");
    console.log("  newRankedTasks (contents):", newRankedTasks.map(t => `${t.content} (Prio: ${t.priority})`));
    console.log("  newP3Tasks (contents):", newP3Tasks.map(t => `${t.content} (Prio: ${t.priority})`));

    setRankedTasks(newRankedTasks);
    setP3Tasks(newP3Tasks);

    setComparisonHistory(prevHistory => [
      {
        challengerContent: currentChallenger.content,
        opponentContent: opponentTask.content,
        winner: challengerWins ? 'challenger' : 'opponent',
        action: actionDescription,
        timestamp: format(new Date(), "HH:mm:ss", { locale: ptBR }),
      },
      ...prevHistory,
    ].slice(0, 3));

    console.log("SEITONPage - After comparison. New Ranked:", newRankedTasks.map(t => t.content), "New P3:", newP3Tasks.map(t => t.content));

    if (challengerFinished) {
      console.log("SEITONPage - Challenger finished its journey. Moving to next challenger from queue.");
      setCurrentChallenger(null);
      setCurrentOpponentIndex(null);
      setTournamentQueue(prev => prev.slice(1));
    }
    
    if (tournamentQueue.length === 0 && currentChallenger === null) {
      console.log("SEITONPage - Tournament finished, moving to result.");
      setCurrentStep('result');
      localStorage.removeItem(SEITON_PROGRESS_KEY);
    }

    setAiComparisonSuggestion(null);
    setAiComparisonExplanation(null);
    setShowAiComparisonSuggestion(false);

  }, [currentChallenger, currentOpponentIndex, rankedTasks, p3Tasks, tournamentQueue, updateTaskAndReturn, setLastUndoableAction]);

  const handleCancelTask = useCallback(async (taskIdToCancel: string) => {
    if (!currentChallenger && currentOpponentIndex === null) {
        showError("Não há tarefa para cancelar no momento.");
        return;
    }

    const currentOpponent = currentOpponentIndex !== null ? rankedTasks[currentOpponentIndex] : null;
    const isChallengerCancelled = currentChallenger?.id === taskIdToCancel;
    const isOpponentCancelled = currentOpponent && currentOpponent.id === taskIdToCancel;

    if (!isChallengerCancelled && !isOpponentCancelled) {
        console.warn("Attempted to cancel a task not currently in comparison:", taskIdToCancel);
        showError("A tarefa selecionada para cancelar não está em comparação.");
        return;
    }

    setLastUndoableAction({
      type: 'cancel',
      snapshotTournamentQueue: tournamentQueue,
      snapshotRankedTasks: rankedTasks,
      snapshotP3Tasks: p3Tasks,
      snapshotCurrentChallenger: currentChallenger,
      snapshotCurrentOpponentIndex: currentOpponentIndex,
      cancelledTaskId: taskIdToCancel,
    });

    const success = await handleApiCall(
        () => completeTask(taskIdToCancel),
        "Cancelando tarefa...",
        "Tarefa cancelada com sucesso!"
    );

    if (success) {
        showSuccess(`Tarefa "${isChallengerCancelled ? currentChallenger?.content : currentOpponent?.content || 'desconhecida'}" cancelada.`);

        if (isChallengerCancelled) {
            setTournamentQueue(prevQueue => prevQueue.filter(task => task.id !== taskIdToCancel));
            setCurrentChallenger(null);
            setCurrentOpponentIndex(null);
        } else if (isOpponentCancelled) {
            setRankedTasks(prevRanked => prevRanked.filter(task => task.id !== taskIdToCancel));
        }

        setComparisonHistory(prevHistory => [
            {
                challengerContent: currentChallenger?.content || "N/A",
                opponentContent: isOpponentCancelled ? currentOpponent?.content || "N/A" : "N/A",
                winner: 'N/A',
                action: `Tarefa "${isChallengerCancelled ? currentChallenger?.content : currentOpponent?.content || 'desconhecida'}" cancelada.`,
                timestamp: format(new Date(), "HH:mm:ss", { locale: ptBR }),
            },
            ...prevHistory,
        ].slice(0, 3));
    } else {
        showError("Falha ao cancelar a tarefa.");
        setLastUndoableAction(null);
    }

    setAiComparisonSuggestion(null);
    setAiComparisonExplanation(null);
    setShowAiComparisonSuggestion(false);

}, [currentChallenger, currentOpponentIndex, rankedTasks, completeTask, tournamentQueue, p3Tasks, setLastUndoableAction]);

  const handleUndo = useCallback(async () => {
    if (!lastUndoableAction) {
      showError("Não há ação para desfazer.");
      return;
    }

    setLoading(true);

    try {
      if (lastUndoableAction.type === 'cancel' && lastUndoableAction.cancelledTaskId) {
        const success = await handleApiCall(
          () => reopenTask(lastUndoableAction.cancelledTaskId!),
          "Desfazendo cancelamento...",
          "Tarefa restaurada no Todoist!"
        );
        if (!success) {
          throw new Error("Falha ao reabrir a tarefa no Todoist.");
        }
      }
      setTournamentQueue(lastUndoableAction.snapshotTournamentQueue);
      setRankedTasks(lastUndoableAction.snapshotRankedTasks);
      setP3Tasks(lastUndoableAction.snapshotP3Tasks);
      setCurrentChallenger(lastUndoableAction.snapshotCurrentChallenger);
      setCurrentOpponentIndex(lastUndoableAction.snapshotCurrentOpponentIndex);
      setCurrentStep('tournamentComparison');

      setLastUndoableAction(null);
      showSuccess("Ação desfeita com sucesso!");
    } catch (error: any) {
      console.error("Erro ao desfazer ação:", error);
      showError(`Falha ao desfazer ação: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [lastUndoableAction, reopenTask, setLoading, setTournamentQueue, setRankedTasks, setP3Tasks, setCurrentChallenger, setCurrentOpponentIndex, setCurrentStep]);

  const handleOpenSetDeadlineDialog = useCallback((task: TodoistTask) => {
    setTaskToSetDeadline(task);
    setShowSetDeadlineDialog(true);
  }, []);

  const handleSaveDeadline = useCallback(async (newDeadlineDate: string | null) => {
    if (!taskToSetDeadline) return;

    setLoading(true);
    try {
      const updatedTask = await handleApiCall(
        () => updateTaskDeadline(taskToSetDeadline.id, newDeadlineDate),
        "Atualizando data limite...",
        newDeadlineDate ? "Data limite definida com sucesso!" : "Data limite removida com sucesso!"
      );

      if (updatedTask) {
        const updateTaskInList = (list: TodoistTask[]) => 
          list.map(t => t.id === updatedTask.id ? updatedTask : t);

        setTournamentQueue(updateTaskInList);
        setRankedTasks(updateTaskInList);
        setP3Tasks(updateTaskInList);

        if (currentChallenger?.id === updatedTask.id) {
          setCurrentChallenger(updatedTask);
        }
      }
    } catch (error) {
      console.error("Erro ao salvar deadline:", error);
      showError("Falha ao salvar a data limite.");
    } finally {
      setLoading(false);
      setShowSetDeadlineDialog(false);
      setTaskToSetDeadline(null);
    }
  }, [taskToSetDeadline, currentChallenger]);

  const handleAISuggestComparison = useCallback(async () => {
    if (!GEMINI_API_KEY) {
      showError("A chave da API do Gemini (VITE_GEMINI_API_KEY) não está configurada.");
      return;
    }
    if (!currentChallenger || currentOpponentIndex === null) {
      showError("Nenhuma tarefa para comparar.");
      return;
    }

    setIsAISuggestingComparison(true);
    setAiComparisonSuggestion(null);
    setAiComparisonExplanation(null);
    setShowAiComparisonSuggestion(true);

    const opponentTask = rankedTasks[currentOpponentIndex];

    const getTaskDetails = (task: TodoistTask, label: string) => {
      const priorityLabel = getPriorityLabel(task.priority);
      const dueDate = task.due?.date ? formatDateForDisplay(task.due) : 'Nenhum';
      const deadlineDate = task.deadline?.date ? formatDateForDisplay(task.deadline) : 'Nenhum';
      const isRecurring = task.due?.is_recurring ? 'Sim' : 'Não';
      const description = task.description || 'Nenhuma descrição.';
      return `Tarefa ${label}: "${task.content}". Descrição: "${description}". Prioridade: ${priorityLabel} (${task.priority}). Vencimento: ${dueDate}. Data Limite: ${deadlineDate}. Recorrente: ${isRecurring}.`;
    };

    const taskADetails = getTaskDetails(currentChallenger, 'A');
    const taskBDetails = getTaskDetails(opponentTask, 'B');

    const systemPrompt = localStorage.getItem(AI_COMPARISON_SYSTEM_PROMPT_KEY) || DEFAULT_AI_COMPARISON_PROMPT;
    const prompt = `${systemPrompt}\n${taskADetails}\n${taskBDetails}`;

    try {
      const response = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `Erro na API Gemini: ${response.statusText}`);
      }

      const data = await response.json();
      const aiResponseContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "Não foi possível obter uma sugestão da IA.";
      
      const lines = aiResponseContent.split('\n').map(line => line.trim()).filter(Boolean);
      if (lines.length > 0) {
        const suggestion = lines[0].toUpperCase() as 'A' | 'B';
        const explanation = lines.slice(1).join(' ');
        setAiComparisonSuggestion(suggestion);
        setAiComparisonExplanation(explanation);
      } else {
        setAiComparisonExplanation("A IA não conseguiu gerar uma sugestão útil.");
      }
    } catch (error: any) {
      console.error("Erro ao obter sugestão da IA para comparação:", error);
      showError(`Erro ao obter sugestão da IA: ${error.message}`);
      setAiComparisonExplanation(`Erro: ${error.message}`);
    } finally {
      setIsAISuggestingComparison(false);
    }
  }, [GEMINI_API_KEY, GEMINI_API_URL, currentChallenger, currentOpponentIndex, rankedTasks, getPriorityLabel]);


  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (loading || showSetDeadlineDialog) return;

      if (currentStep === 'tournamentComparison' && currentChallenger && currentOpponentIndex !== null) {
        if (event.key === '1' || event.key === 'ArrowUp') {
          event.preventDefault();
          handleTournamentComparison(true);
        } else if (event.key === '2' || event.key === 'ArrowDown') {
          event.preventDefault();
          handleTournamentComparison(false);
        } else if (event.key === 'x' || event.key === 'X') {
          event.preventDefault();
          if (currentChallenger) {
            handleCancelTask(currentChallenger.id); 
          } else {
            showError("Nenhuma tarefa desafiante para cancelar.");
          }
        } else if (event.key === 'z' || event.key === 'Z') {
          event.preventDefault();
          handleUndo();
        } else if (event.key === 'i' || event.key === 'I') {
          event.preventDefault();
          handleAISuggestComparison();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [loading, currentStep, currentChallenger, currentOpponentIndex, handleTournamentComparison, handleCancelTask, handleUndo, showSetDeadlineDialog, handleAISuggestComparison]);

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

  const selectedTask = useMemo(() => {
      if (!rankedTasks || rankedTasks.length === 0) {
          return null;
      }
      
      const activeTask = rankedTasks.find(task => 
          !task.is_completed && !(task as any).completed
      );
      
      return activeTask || null; 
  }, [rankedTasks]);

  const handleResetRanking = useCallback(async () => {
    setLoading(true);
    localStorage.removeItem(SEITON_PROGRESS_KEY);
    localStorage.removeItem(SEITON_LAST_RANKING_KEY);
    showSuccess("Ranking resetado. Recarregando tarefas...");
    setTournamentQueue([]);
    setRankedTasks([]);
    setP3Tasks([]);
    setCurrentChallenger(null);
    setCurrentOpponentIndex(null);
    setComparisonHistory([]);
    setLastUndoableAction(null);
    setAiComparisonSuggestion(null);
    setAiComparisonExplanation(null);
    setShowAiComparisonSuggestion(false);
    await fetchAndSetupTasks();
  }, [fetchAndSetupTasks]);

  const renderTaskCard = (
    task: TodoistTask | null,
    title: string,
    description: string,
    priorityOverride?: number,
    onCardClick?: () => void
  ) => {
    if (!task) {
        return null;
    }
    const displayPriority = priorityOverride !== undefined ? priorityOverride : task.priority;
    return (
      <Card
        className={cn(
          "w-full shadow-lg bg-white/80 backdrop-blur-sm p-4",
          onCardClick && "cursor-pointer hover:border-blue-500 transition-all duration-200"
        )}
        onClick={onCardClick}
        tabIndex={onCardClick ? 0 : -1}
        role={onCardClick ? "button" : undefined}
      >
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
              onClick={(e) => e.stopPropagation()}
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
              Vencimento: <span className="font-medium text-gray-700">{formatDateForDisplay(task.due)}</span>
            </p>
          )}
          {task.deadline && (
            <p className="text-xs text-gray-500 mt-1">
              Data Limite: <span className="font-medium text-gray-700">{formatDateForDisplay(task.deadline)}</span>
            </p>
          )}
        </CardContent>
        <CardFooter className="flex justify-center gap-2 mt-4 p-0">
          <Button
            onClick={(e) => {
              e.stopPropagation();
              handleCancelTask(task.id);
            }}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold py-1 px-4 rounded-md transition-colors flex items-center text-sm"
          >
            <X className="mr-1 h-4 w-4" /> Cancelar
          </Button>
          <Button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenSetDeadlineDialog(task);
            }}
            variant="outline"
            className="border-gray-300 text-gray-700 hover:bg-gray-100 font-semibold py-1 px-4 rounded-md transition-colors flex items-center text-sm"
          >
            <Clock className="mr-1 h-4 w-4" /> Definir Data Limite
          </Button>
        </CardFooter>
      </Card>
    );
  };

  console.log("SEITONPage Render Cycle:");
  console.log("  Loading:", loading);
  console.log("  Current Step:", currentStep);
  console.log("  Current Challenger:", currentChallenger?.content || "N/A");
  console.log("  Current Opponent Index:", currentOpponentIndex);
  console.log("  Tournament Queue Length:", tournamentQueue.length);
  console.log("  Ranked Tasks Length:", rankedTasks.length);
  console.log("  P3 Tasks Length:", p3Tasks.length);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-100 p-4">
        <p className="text-lg text-blue-600">Carregando tarefas...</p>
      </div>
    );
  }

  const currentOpponent = currentOpponentIndex !== null ? rankedTasks[currentOpponentIndex] : null;

  if (!GEMINI_API_KEY) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-blue-100 p-4">
        <Card className="w-full max-w-md shadow-lg bg-white/80 backdrop-blur-sm p-6 text-center space-y-4">
          <CardTitle className="text-3xl font-bold text-gray-800">Erro de Configuração</CardTitle>
          <CardDescription className="text-lg text-red-600 mt-2">
            A chave da API do Gemini (<code>VITE_GEMINI_API_KEY</code>) não está configurada.
          </CardDescription>
          <p className="text-sm text-gray-700">
            Por favor, adicione-a ao seu arquivo <code>.env</code> na raiz do projeto para usar as funcionalidades de IA.
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Exemplo: <code>VITE_GEMINI_API_KEY=SUA_CHAVE_AQUI</code>
          </p>
          <Button onClick={() => navigate("/main-menu")} className="mt-4 bg-blue-600 hover:bg-blue-700">
            Voltar ao Menu Principal
          </Button>
        </Card>
        <MadeWithDyad />
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
          <div className="w-20"></div>
        </div>
        <p className="text-xl text-blue-700 text-center mb-8">
          Priorize suas tarefas com torneio
        </p>
      </div>

      <Card className="w-full max-w-md shadow-lg bg-white/80 backdrop-blur-sm p-6">
        {currentStep === 'tournamentComparison' && currentChallenger && currentOpponent && currentOpponentIndex !== null ? (
          <div className="space-y-6 text-center">
            <CardTitle className="text-2xl font-bold text-gray-800">Qual é mais importante?</CardTitle>
            <CardDescription className="text-lg text-gray-700">
              Escolha a tarefa que você considera mais prioritária ou cancele uma delas.
            </CardDescription>
            <div className="grid grid-cols-1 gap-4">
              {renderTaskCard(currentChallenger, "Tarefa A", "Challenger", currentChallenger.priority, () => handleTournamentComparison(true))}
              <p className="text-xl font-bold text-gray-700">VS</p>
              {renderTaskCard(currentOpponent, "Tarefa B", `Posição ${currentOpponentIndex + 1} no Ranking`, currentOpponent.priority, () => handleTournamentComparison(false))}
            </div>
            
            <div className="mt-6 space-y-2">
              <Button
                onClick={handleAISuggestComparison}
                disabled={isAISuggestingComparison}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 rounded-md transition-colors flex items-center justify-center"
              >
                {isAISuggestingComparison ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Brain className="mr-2 h-5 w-5" />
                )}
                Sugestão da IA (I)
              </Button>
              {showAiComparisonSuggestion && (
                <div className="p-3 bg-gray-100 rounded-md text-sm text-gray-700 text-left">
                  {aiComparisonSuggestion && (
                    <p className="font-semibold mb-1">
                      A IA sugere: <span className={cn(
                        aiComparisonSuggestion === 'A' ? 'text-blue-600' : 'text-blue-600'
                      )}>Tarefa {aiComparisonSuggestion}</span>
                    </p>
                  )}
                  {aiComparisonExplanation && (
                    <p>{aiComparisonExplanation}</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-center space-x-4 mt-6">
              <Button onClick={() => handleTournamentComparison(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-md transition-colors flex items-center">
                <ChevronLeft className="mr-2 h-5 w-5" /> ESCOLHER CIMA (1 ou ↑)
              </Button>
              <Button onClick={() => handleTournamentComparison(false)} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-md transition-colors flex items-center">
                ESCOLHER BAIXO (2 ou ↓) <ChevronRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
        ) : currentStep === 'result' ? (
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

            {tournamentQueue.length === 0 && rankedTasks.length === 0 && p3Tasks.length === 0 && (
              <p className="text-gray-600">Nenhuma tarefa para priorizar. Bom trabalho!</p>
            )}

            <Button onClick={() => navigate("/main-menu")} className="mt-6 bg-blue-600 hover:bg-blue-700">
              Voltar ao Menu Principal
            </Button>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <CardTitle className="text-2xl font-bold text-gray-800">Processando tarefas...</CardTitle>
            <CardDescription className="text-lg text-gray-600">
              Aguarde enquanto organizamos seu backlog.
            </CardDescription>
          </div>
        )}
      </Card>
      
      <div className="mt-8 w-full max-w-3xl flex justify-between items-center">
        <Button
          variant="outline"
          onClick={() => setShowDebugPanel(!showDebugPanel)}
          className="flex items-center gap-2 text-gray-700 hover:text-gray-900 border-gray-300 hover:border-gray-400 bg-white/70 backdrop-blur-sm"
        >
          <Bug size={20} /> {showDebugPanel ? "Esconder Debug" : "Mostrar Debug"}
        </Button>

        <div className="flex gap-4">
          {lastUndoableAction && (
            <Button
              variant="outline"
              onClick={handleUndo}
              disabled={loading}
              className="flex items-center gap-2 text-red-700 hover:text-red-900 border-red-300 hover:border-red-400 bg-white/70 backdrop-blur-sm"
            >
              <Undo2 size={20} /> Desfazer (Z)
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleResetRanking}
            disabled={loading}
            className="flex items-center gap-2 text-blue-700 hover:text-blue-900 border-blue-300 hover:border-blue-400 bg-white/70 backdrop-blur-sm"
          >
            <RotateCcw size={20} /> Resetar Ranking
          </Button>
        </div>
      </div>

        {showDebugPanel && (
          <Card className="mt-4 p-4 shadow-lg bg-white/90 backdrop-blur-sm text-left text-sm w-full max-w-3xl">
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
      <MadeWithDyad />

      {taskToSetDeadline && (
        <SetDeadlineDialog
          isOpen={showSetDeadlineDialog}
          onClose={() => setShowSetDeadlineDialog(false)}
          currentDeadline={taskToSetDeadline.deadline}
          onSave={handleSaveDeadline}
          loading={loading}
        />
      )}
    </div>
  );
};

export default SEITONPage;