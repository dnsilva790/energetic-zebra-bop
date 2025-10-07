"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Play, Pause, Square, Check, SkipForward, CalendarDays, ExternalLink, Repeat, Clock
} from "lucide-react";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { showSuccess, showError } from "@/utils/toast";
import { getTasks, completeTask, handleApiCall, updateTaskDueDate, updateTaskDeadline } from "@/lib/todoistApi";
import { format, parseISO, setHours, setMinutes, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TodoistTask } from "@/lib/types";
import { shouldExcludeTaskFromTriage } from "@/utils/taskFilters";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, formatDateForDisplay } from "@/lib/utils";
import AITutorChat from "@/components/AITutorChat";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import SetDeadlineDialog from "@/components/SetDeadlineDialog";

const SEISO_FILTER_KEY = 'seiso_filter_input';
const SEISO_USE_SEITON_RANKING_KEY = 'seiso_use_seiton_ranking';
const SEITON_LAST_RANKING_KEY = 'seiton_last_ranking';
const SEITON_PROGRESS_KEY = 'seiton_progress';
const SEITON_FALLBACK_TASK_LIMIT = 12;

interface SeitonRankingData {
  rankedTasks: TodoistTask[];
  p3Tasks: TodoistTask[];
}

interface SeitonProgress {
  tournamentQueue: TodoistTask[];
  rankedTasks: TodoistTask[];
  p3Tasks: TodoistTask[];
  currentStep: 'loading' | 'tournamentComparison' | 'result';
  currentChallenger: TodoistTask | null;
  currentOpponentIndex: number | null;
  comparisonHistory: any[];
}

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
};

const shuffleArray = (array: any[]) => {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }
  return array;
};

const SEISOPage = () => {
  const navigate = useNavigate();
  const [filterInput, setFilterInput] = useState(() => {
    const savedFilter = localStorage.getItem(SEISO_FILTER_KEY);
    return savedFilter || "today | overdue";
  });
  const [useSeitonRanking, setUseSeitonRanking] = useState(() => {
    const savedPreference = localStorage.getItem(SEISO_USE_SEITON_RANKING_KEY);
    return savedPreference ? JSON.parse(savedPreference) : true;
  });
  const [sessionStarted, setSessionStarted] = useState(false); // Inicialmente false
  const [allTasksInSession, setAllTasksInSession] = useState<TodoistTask[]>([]);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [isSessionFinished, setIsSessionFinished] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filterError, setFilterError] = useState("");

  const [isUsingSeitonRanking, setIsUsingSeitonRanking] = useState(false);

  const [countdownInputDuration, setCountdownInputDuration] = useState("25");
  const [countdownTimeLeft, setCountdownTimeLeft] = useState(0);
  const [isCountdownActive, setIsCountdownActive] = useState(false);
  const [isCountdownPaused, setIsCountdownPaused] = useState(false);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const alarmAudioRef = useRef<HTMLAudioElement>(null);

  const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
  const [selectedDueDate, setSelectedDueDate] = useState<Date | undefined>(undefined);
  const [selectedDueTime, setSelectedDueTime] = useState<string>("");

  const [isAITutorChatOpen, setIsAITutorChatOpen] = useState(false);

  const [showSetDeadlineDialog, setShowSetDeadlineDialog] = useState(false);
  const [taskToSetDeadline, setTaskToSetDeadline] = useState<TodoistTask | null>(null);

  const totalTasks = allTasksInSession.length;
  const currentTask = allTasksInSession[currentTaskIndex];

  useEffect(() => {
    localStorage.setItem(SEISO_FILTER_KEY, filterInput);
  }, [filterInput]);

  useEffect(() => {
    localStorage.setItem(SEISO_USE_SEITON_RANKING_KEY, JSON.stringify(useSeitonRanking));
  }, [useSeitonRanking]);

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

  const fetchTasksAndFilter = useCallback(async () => {
    setLoading(true);
    setFilterError("");
    
    let tasksToProcess: TodoistTask[] = [];
    let usingSeitonSource = false;

    console.log("SEISOPage - fetchTasksAndFilter: useSeitonRanking is", useSeitonRanking);

    // 1. Tentar carregar tarefas do filtro do usuário primeiro
    console.log("SEISOPage - Tentando carregar tarefas do filtro do usuário:", filterInput);
    const fetchedTasksFromFilter = await handleApiCall(() => getTasks(filterInput), "Carregando tarefas do filtro...");
    
    if (fetchedTasksFromFilter && fetchedTasksFromFilter.length > 0) {
      tasksToProcess = fetchedTasksFromFilter;
      usingSeitonSource = false;
      showSuccess(`Sessão iniciada com ${fetchedTasksFromFilter.length} tarefas do filtro.`);
      console.log("SEISOPage - Loaded tasks from user filter:", fetchedTasksFromFilter.map(t => t.content));
    } else {
      console.log("SEISOPage - O filtro do usuário não retornou tarefas.");

      // 2. Se o filtro estiver vazio E a opção "Usar Ranking SEITON" estiver ativada, tentar carregar do SEITON
      if (useSeitonRanking) {
        console.log("SEISOPage - Filtro vazio e 'Usar Ranking SEITON' ativado. Tentando carregar tarefas do ranking SEITON...");
        
        // Tentar carregar do SEITON_LAST_RANKING_KEY (sessão finalizada)
        const savedLastRanking = localStorage.getItem(SEITON_LAST_RANKING_KEY);
        console.log("SEISOPage - SEITON_LAST_RANKING_KEY raw:", savedLastRanking);
        if (savedLastRanking) {
          try {
            const parsedLastRanking: SeitonRankingData = JSON.parse(savedLastRanking);
            const combinedSeitonTasks = [...parsedLastRanking.rankedTasks, ...parsedLastRanking.p3Tasks];
            const seitonTopTasks = combinedSeitonTasks.slice(0, SEITON_FALLBACK_TASK_LIMIT);
            if (seitonTopTasks.length > 0) {
              tasksToProcess = seitonTopTasks;
              usingSeitonSource = true;
              showSuccess(`Sessão iniciada com ${seitonTopTasks.length} tarefas do último ranking SEITON (finalizado).`);
              console.log("SEISOPage - Loaded tasks from SEITON_LAST_RANKING_KEY:", seitonTopTasks.map(t => t.content));
            } else {
              console.log("SEISOPage - SEITON_LAST_RANKING_KEY encontrado, mas não contém tarefas úteis após combinação/limite.");
            }
          } catch (e) {
            console.error("Erro ao analisar SEITON_LAST_RANKING_KEY:", e);
            showError("Erro ao carregar o último ranking SEITON finalizado.");
          }
        } else {
          console.log("SEISOPage - Nenhum SEITON_LAST_RANKING_KEY encontrado.");
        }

        // Se ainda não houver tarefas, tentar SEITON_PROGRESS_KEY (sessão em progresso)
        if (tasksToProcess.length === 0) {
          console.log("SEISOPage - Nenhuma tarefa do ranking finalizado. Tentando ranking em progresso...");
          const savedInProgressRanking = localStorage.getItem(SEITON_PROGRESS_KEY);
          console.log("SEISOPage - SEITON_PROGRESS_KEY raw:", savedInProgressRanking);
          if (savedInProgressRanking) {
            try {
              const parsedInProgressRanking: SeitonProgress = JSON.parse(savedInProgressRanking);
              const combinedInProgressTasks = [...parsedInProgressRanking.rankedTasks, ...parsedInProgressRanking.p3Tasks];
              const seitonInProgressTasks = combinedInProgressTasks.slice(0, SEITON_FALLBACK_TASK_LIMIT);
              if (seitonInProgressTasks.length > 0) {
                tasksToProcess = seitonInProgressTasks;
                usingSeitonSource = true;
                showSuccess(`Sessão iniciada com ${seitonInProgressTasks.length} tarefas do ranking SEITON (em progresso).`);
                console.log("SEISOPage - Loaded tasks from SEITON_PROGRESS_KEY:", seitonInProgressTasks.map(t => t.content));
              } else {
                console.log("SEISOPage - SEITON_PROGRESS_KEY encontrado, mas não contém tarefas úteis após combinação/limite.");
              }
            } catch (e) {
              console.error("Erro ao analisar SEITON_PROGRESS_KEY:", e);
              showError("Erro ao carregar o ranking SEITON em progresso.");
            }
          } else {
            console.log("SEISOPage - Nenhum SEITON_PROGRESS_KEY encontrado.");
          }
        }
      } else {
        console.log("SEISOPage - Filtro vazio e 'Usar Ranking SEITON' desativado. Não tentando carregar do SEITON.");
      }
    }

    console.log("SEISOPage - Tasks to process BEFORE final filtering (total):", tasksToProcess.length);
    // Processar e definir as tarefas se alguma foi encontrada
    if (tasksToProcess.length > 0) {
      const filteredAndCleanedTasks = tasksToProcess
        .filter((task: TodoistTask) => task.parent_id === null)
        .filter((task: TodoistTask) => !task.is_completed);

      console.log("SEISOPage - Tasks AFTER final filtering (parent_id === null && !is_completed):", filteredAndCleanedTasks.length);

      const p1 = filteredAndCleanedTasks.filter(task => task.priority === 4);
      const nonP1Tasks = filteredAndCleanedTasks.filter(task => task.priority !== 4);

      let others: TodoistTask[];
      if (usingSeitonSource) { // Se estiver usando qualquer ranking SEITON, mantém a ordem para não-P1
        others = nonP1Tasks;
      } else { // Se estiver usando filtro, embaralha as tarefas não-P1
        others = shuffleArray(nonP1Tasks);
      }

      const combinedTasks = [...p1, ...others];
      setAllTasksInSession(combinedTasks);
      setIsUsingSeitonRanking(usingSeitonSource);
      setSessionStarted(true); // Inicia a sessão se houver tarefas
      setCurrentTaskIndex(0);
      setTasksCompleted(0);
      setIsSessionFinished(false);
    } else {
      showSuccess("Nenhuma tarefa encontrada. Tente outro filtro ou complete o SEITON.");
      setIsSessionFinished(true);
      setSessionStarted(false); // Garante que a sessão não está iniciada
      setIsUsingSeitonRanking(false);
      setAllTasksInSession([]);
    }
    setLoading(false);
  }, [filterInput, navigate, useSeitonRanking]);

  // REMOVIDO: useEffect que chamava fetchTasksAndFilter automaticamente
  // useEffect(() => {
  //   if (!sessionStarted) {
  //     fetchTasksAndFilter();
  //   }
  // }, [fetchTasksAndFilter, sessionStarted]);

  useEffect(() => {
    if (currentTask && sessionStarted) {
      const initialDuration = parseInt(countdownInputDuration) * 60;
      setCountdownTimeLeft(initialDuration > 0 ? initialDuration : 0);
      setIsCountdownActive(false);
      setIsCountdownPaused(false);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    }
  }, [currentTask, sessionStarted, countdownInputDuration]);

  useEffect(() => {
    if (isCountdownActive && countdownTimeLeft > 0) {
      countdownTimerRef.current = setInterval(() => {
        setCountdownTimeLeft((prevTime) => prevTime - 1);
      }, 1000);
    } else if (countdownTimeLeft === 0 && isCountdownActive) {
      setIsCountdownActive(false);
      showSuccess("Tempo esgotado para a tarefa!");
      if (alarmAudioRef.current) {
        alarmAudioRef.current.play().catch(e => console.error("Error playing alarm sound:", e));
      }
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    }

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [isCountdownActive, countdownTimeLeft]);

  const startCountdown = useCallback(() => {
    if (countdownTimeLeft > 0) {
      setIsCountdownActive(true);
      setIsCountdownPaused(false);
    } else {
      const initialDuration = parseInt(countdownInputDuration) * 60;
      if (initialDuration > 0) {
        setCountdownTimeLeft(initialDuration);
        setIsCountdownActive(true);
        setIsCountdownPaused(false);
      } else {
        showError("Por favor, insira um tempo válido para o contador.");
      }
    }
  }, [countdownTimeLeft, countdownInputDuration]);

  const pauseCountdown = useCallback(() => {
    setIsCountdownActive(false);
    setIsCountdownPaused(true);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
  }, []);

  const resetCountdown = useCallback(() => {
    setIsCountdownActive(false);
    setIsCountdownPaused(false);
    const initialDuration = parseInt(countdownInputDuration) * 60;
    setCountdownTimeLeft(initialDuration > 0 ? initialDuration : 0);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
  }, [countdownInputDuration]);

  const stopAllTimers = useCallback(() => {
    setIsCountdownActive(false);
    setIsCountdownPaused(false);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    if (alarmAudioRef.current) {
      alarmAudioRef.current.pause();
      alarmAudioRef.current.currentTime = 0;
    }
  }, []);

  const handleTaskActionComplete = useCallback(() => {
    stopAllTimers();
    setAllTasksInSession(prevTasks => {
      const updatedTasks = prevTasks.filter(task => task.id !== currentTask?.id);
      if (updatedTasks.length === 0) {
        setIsSessionFinished(true);
        setSessionStarted(false); // Garante que a sessão é marcada como não iniciada
      }
      return updatedTasks;
    });
  }, [currentTask, stopAllTimers]);

  const handleCompleteTask = useCallback(async () => {
    if (currentTask) {
      const success = await handleApiCall(() => completeTask(currentTask.id), "Concluindo tarefa...", "Tarefa concluída no Todoist!");
      if (success) {
        setTasksCompleted(tasksCompleted + 1);
        handleTaskActionComplete();
      } else {
        showError("Falha ao concluir a tarefa no Todoist.");
      }
    }
  }, [currentTask, tasksCompleted, handleTaskActionComplete]);

  const handleSkipTask = useCallback(() => {
    if (currentTask) {
      showSuccess("Tarefa pulada.");
      handleTaskActionComplete();
    }
  }, [currentTask, handleTaskActionComplete]);

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
      setSelectedDueDate(undefined);
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
      setShowRescheduleDialog(false);
      handleTaskActionComplete();
    } else {
      showError("Falha ao reagendar a tarefa.");
    }
  }, [currentTask, selectedDueDate, selectedDueTime, handleTaskActionComplete]);

  const handleGuideMe = useCallback(() => {
    if (!currentTask) {
      showError("Nenhuma tarefa selecionada para guiar.");
      return;
    }
    setIsAITutorChatOpen(true);
  }, [currentTask]);

  const handleOpenSetDeadlineDialog = useCallback(() => {
    if (!currentTask) {
      showError("Nenhuma tarefa selecionada para definir data limite.");
      return;
    }
    setTaskToSetDeadline(currentTask);
    setShowSetDeadlineDialog(true);
  }, [currentTask]);

  const handleSaveDeadline = useCallback(async (newDeadline: string | null) => {
    if (!taskToSetDeadline) return;

    setLoading(true);
    try {
      const updatedTask = await handleApiCall(
        () => updateTaskDeadline(taskToSetDeadline.id, newDeadline),
        "Atualizando data limite...",
        newDeadline ? "Data limite definida com sucesso!" : "Data limite removida com sucesso!"
      );

      if (updatedTask) {
        setAllTasksInSession(prevTasks => prevTasks.map(t => t.id === updatedTask.id ? updatedTask : t));
      }
    } catch (error) {
      console.error("Erro ao salvar deadline:", error);
      showError("Falha ao salvar a data limite.");
    } finally {
      setLoading(false);
      setShowSetDeadlineDialog(false);
      setTaskToSetDeadline(null);
    }
  }, [taskToSetDeadline]);


  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (loading || isSessionFinished || !currentTask || !sessionStarted || showRescheduleDialog || isAITutorChatOpen || showSetDeadlineDialog) return;

      if (event.key === 'c' || event.key === 'C') {
        event.preventDefault();
        handleCompleteTask();
      } else if (event.key === 'p' || event.key === 'P') {
        event.preventDefault();
        handleSkipTask();
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        handleOpenRescheduleDialog();
      } else if (event.key === 'g' || event.key === 'G') {
        event.preventDefault();
        handleGuideMe();
      } else if (event.key === 'd' || event.key === 'D') {
        event.preventDefault();
        handleOpenSetDeadlineDialog();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [loading, isSessionFinished, currentTask, sessionStarted, showRescheduleDialog, isAITutorChatOpen, showSetDeadlineDialog, handleCompleteTask, handleSkipTask, handleOpenRescheduleDialog, handleGuideMe, handleOpenSetDeadlineDialog]);

  const taskProgressValue = totalTasks > 0 ? (currentTaskIndex / totalTasks) * 100 : 0;
  const countdownProgressValue = countdownTimeLeft > 0 && parseInt(countdownInputDuration) * 60 > 0 
    ? ((parseInt(countdownInputDuration) * 60 - countdownTimeLeft) / (parseInt(countdownInputDuration) * 60)) * 100 
    : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-orange-100 p-4">
        <p className="text-lg text-orange-600">Carregando tarefas...</p>
      </div>
    );
  }

  if (isSessionFinished) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-orange-100 p-4">
        <Card className="w-full max-w-md shadow-lg bg-white/80 backdrop-blur-sm p-6 text-center space-y-4">
          <CardTitle className="text-3xl font-bold text-gray-800">Sessão Concluída!</CardTitle>
          <CardDescription className="text-lg text-gray-600">
            Você concluiu {tasksCompleted} de {allTasksInSession.length} tarefas.
          </CardDescription>
          <Button onClick={() => navigate("/main-menu")} className="mt-4 bg-blue-600 hover:bg-blue-700">
            Voltar ao Menu Principal
          </Button>
          <Button 
            variant="outline" 
            onClick={() => { 
              setIsSessionFinished(false); 
              setSessionStarted(false); // Garante que a sessão não está iniciada para mostrar o filtro
              setFilterInput(localStorage.getItem(SEISO_FILTER_KEY) || "today | overdue"); 
            }} 
            className="mt-2"
          >
            Iniciar Nova Sessão
          </Button>
        </Card>
        <MadeWithDyad />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-orange-100 p-4 relative">
      <div className="w-full max-w-3xl mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={() => navigate("/main-menu")} className="text-orange-800 hover:bg-orange-200">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <h1 className="text-4xl font-extrabold text-orange-800 text-center flex-grow">
            SEISO - Executar Tarefas
          </h1>
          <div className="w-20"></div>
        </div>
        <p className="text-xl text-orange-700 text-center mb-8">
          Foque nas suas tarefas prioritárias
        </p>
      </div>

      {!sessionStarted ? ( // Esta condição agora garante que o filtro aparece primeiro
        <Card className="w-full max-w-md shadow-lg bg-white/80 backdrop-blur-sm p-6">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-gray-800">Definir Filtro de Tarefas</CardTitle>
            <CardDescription className="text-lg text-gray-600 mt-2">
              Insira um filtro do Todoist para suas tarefas de hoje.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between space-x-2 p-2 border rounded-md bg-gray-50">
              <Label htmlFor="use-seiton-ranking" className="text-base font-medium text-gray-700">
                Usar Ranking SEITON como fallback
              </Label>
              <Switch
                id="use-seiton-ranking"
                checked={useSeitonRanking}
                onCheckedChange={setUseSeitonRanking}
              />
            </div>
            <p className="text-sm text-gray-500 -mt-2">
              {useSeitonRanking
                ? "Se o filtro estiver vazio, tentará carregar tarefas do ranking SEITON."
                : "Usa apenas o filtro do Todoist abaixo, sem recorrer ao ranking SEITON."}
            </p>

            <div className="space-y-2">
              <Label htmlFor="todoist-filter">Filtro Todoist</Label>
              <Input
                id="todoist-filter"
                type="text"
                placeholder="Ex: today | overdue"
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
              onClick={fetchTasksAndFilter} // Agora o botão chama a função
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-md transition-colors"
              disabled={loading}
            >
              {loading ? "Carregando..." : "Iniciar Sessão"}
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
                {isUsingSeitonRanking && (
                  <p className="text-sm text-purple-600 font-medium mt-2">
                    (Esta tarefa é uma sugestão do ranking SEITON)
                  </p>
                )}
              </div>

              <div className="flex flex-col items-center space-y-3 p-4 border rounded-lg bg-red-50/50">
                <h3 className="text-xl font-bold text-red-700">Contador de Tempo</h3>
                <div className="flex items-center space-x-4">
                  <Label htmlFor="countdown-input-duration" className="text-lg">Tempo Máximo (min):</Label>
                  <Input
                    id="countdown-input-duration"
                    type="number"
                    value={countdownInputDuration}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCountdownInputDuration(value);
                      if (!isCountdownActive && !isCountdownPaused) {
                        setCountdownTimeLeft(parseInt(value) * 60 || 0);
                      }
                    }}
                    className="w-24 text-center text-lg font-bold"
                    disabled={isCountdownActive}
                    min="1"
                  />
                </div>
                <div className="text-6xl font-bold text-red-800">
                  {formatTime(countdownTimeLeft)}
                </div>
                <Progress value={countdownProgressValue} className="w-full h-2 bg-red-200 [&>*]:bg-red-600" />
                <div className="flex space-x-2">
                  {!isCountdownActive && !isCountdownPaused && (
                    <Button onClick={startCountdown} className="bg-green-600 hover:bg-green-700 text-white">
                      <Play className="h-5 w-5" /> Iniciar
                    </Button>
                  )}
                  {isCountdownActive && (
                    <Button onClick={pauseCountdown} className="bg-yellow-600 hover:bg-yellow-700 text-white">
                      <Pause className="h-5 w-5" /> Pausar
                    </Button>
                  )}
                  {isCountdownPaused && (
                    <Button onClick={startCountdown} className="bg-green-600 hover:bg-green-700 text-white">
                      <Play className="h-5 w-5" /> Continuar
                    </Button>
                  )}
                  <Button onClick={resetCountdown} className="bg-gray-600 hover:bg-gray-700 text-white">
                      <Square className="h-5 w-5" /> Resetar
                  </Button>
                </div>
              </div>

              <div className="flex justify-center space-x-4 mt-6">
                <Button
                  onClick={handleCompleteTask}
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-md transition-colors flex items-center"
                >
                  <Check className="mr-2 h-5 w-5" /> CONCLUÍDA (C)
                </Button>
                <Button
                  onClick={handleSkipTask}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition-colors flex items-center"
                >
                  <SkipForward className="mr-2 h-5 w-5" /> PRÓXIMA (P)
                </Button>
                <Button
                  onClick={handleOpenRescheduleDialog}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-md transition-colors flex items-center"
                >
                  <CalendarDays className="mr-2 h-5 w-5" /> REAGENDAR (R)
                </Button>
                <Button
                  onClick={handleOpenSetDeadlineDialog}
                  className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-md transition-colors flex items-center"
                >
                  <Clock className="mr-2 h-5 w-5" /> DATA LIMITE (D)
                </Button>
                <Button
                  onClick={handleGuideMe}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-md transition-colors flex items-center"
                >
                  Guiar-me (TDAH) (G)
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-600">
              <p>Nenhuma tarefa encontrada para esta sessão.</p>
            </div>
          )}
          {!isSessionFinished && currentTask && (
            <CardFooter className="flex flex-col items-center p-6 border-t mt-6">
              <p className="text-sm text-gray-600 mb-2">
                Tarefa {currentTaskIndex + 1} de {totalTasks}
              </p>
              <Progress value={taskProgressValue} className="w-full h-2 bg-orange-200 [&>*]:bg-orange-600" />
            </CardFooter>
          )}
        </Card>
      )}

      <audio ref={alarmAudioRef} src="/alarm.mp3" preload="auto" />

      <MadeWithDyad />

      <Sheet open={isAITutorChatOpen} onOpenChange={setIsAITutorChatOpen}>
        <SheetContent className="flex flex-col sm:max-w-lg md:max-w-xl">
          {currentTask && (
            <AITutorChat
              taskTitle={currentTask.content}
              taskDescription={currentTask.description || 'Nenhuma descrição fornecida.'}
              taskId={currentTask.id}
              onClose={() => setIsAITutorChatOpen(false)}
              isTaskCompleted={currentTask.is_completed}
              className="flex-grow"
            />
          )}
        </SheetContent>
      </Sheet>

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

export default SEISOPage;