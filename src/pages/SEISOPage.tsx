"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Play, Pause, Square, Check, SkipForward, Timer as TimerIcon, ExternalLink, Repeat } from "lucide-react";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { showSuccess, showError } from "@/utils/toast";
import { getTasks, completeTask, handleApiCall } from "@/lib/todoistApi";
import { format, parseISO, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TodoistTask } from "@/lib/types";
import { shouldExcludeTaskFromTriage } from "@/utils/taskFilters";
import utcToZonedTime from "date-fns-tz/utcToZonedTime"; // Importar diretamente
import formatInTimeZone from "date-fns-tz/formatInTimeZone"; // Importar diretamente

const POMODORO_DURATION = 25 * 60; // 25 minutes in seconds
const BRASILIA_TIMEZONE = 'America/Sao_Paulo'; // Fuso horário de Brasília

const parseTimeEstimate = (task: TodoistTask): number => {
  if (task.priority === 4) return 45 * 60; // P1 (highest) -> 45 min
  if (task.priority === 3) return 25 * 60; // P2 -> 25 min
  if (task.priority === 2) return 15 * 60; // P3 -> 15 min
  return 10 * 60; // P4 (lowest) or no priority -> 10 min
};

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
};

const SEISOPage = () => {
  const navigate = useNavigate();
  const [allTasks, setAllTasks] = useState<TodoistTask[]>([]);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const [isSessionFinished, setIsSessionFinished] = useState(false);
  const [loading, setLoading] = useState(true);

  const [pomodoroTimeLeft, setPomodoroTimeLeft] = useState(POMODORO_DURATION);
  const [isPomodoroActive, setIsPomodoroActive] = useState(false);
  const [isPomodoroPaused, setIsPomodoroPaused] = useState(false);
  const pomodoroTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [taskTimeElapsed, setTaskTimeElapsed] = useState(0);
  const [isTaskActive, setIsTaskActive] = useState(false);
  const [isTaskPaused, setIsTaskPaused] = useState(false);
  const taskTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [currentTaskEstimate, setCurrentTaskEstimate] = useState(0);

  const totalTasks = allTasks.length;
  const currentTask = allTasks[currentTaskIndex];

  // Adicionando log para o estado de carregamento e renderização
  console.log("SEISOPage - Render. Loading:", loading, "isSessionFinished:", isSessionFinished, "currentTask:", currentTask?.content);

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

  const fetchTasksForToday = useCallback(async () => {
    setLoading(true);
    console.log("SEISOPage - fetchTasksForToday: Starting.");
    const fetchedTasks = await handleApiCall(getTasks, "Carregando tarefas para hoje...");
    console.log("SEISOPage - fetchTasksForToday: handleApiCall returned:", fetchedTasks ? `${fetchedTasks.length} tasks` : "undefined");

    if (fetchedTasks) {
      const filteredTasks = fetchedTasks
        .filter((task: TodoistTask) => !shouldExcludeTaskFromTriage(task))
        .filter((task: TodoistTask) => !task.is_completed)
        .filter((task: TodoistTask) => {
          // Para verificar se é "hoje" no fuso horário de Brasília
          const taskDueDate = task.due?.date ? parseISO(task.due.date) : null;
          if (taskDueDate) {
            const zonedTaskDate = utcToZonedTime(taskDueDate, BRASILIA_TIMEZONE);
            const nowZoned = utcToZonedTime(new Date(), BRASILIA_TIMEZONE);
            const isTaskDueToday = isToday(zonedTaskDate, { locale: ptBR, now: nowZoned });
            console.log(`SEISOPage - Task: ${task.content}, DueDate: ${task.due?.date}, ZonedDate: ${zonedTaskDate}, IsToday: ${isTaskDueToday}`);
            return isTaskDueToday;
          }
          // Inclui tarefas sem data de vencimento
          console.log(`SEISOPage - Task: ${task.content}, No DueDate. Including.`);
          return !task.due; 
        });

      console.log("SEISOPage - fetchTasksForToday: Filtered tasks count:", filteredTasks.length);
      if (filteredTasks.length === 0) {
        showSuccess("Nenhuma tarefa para hoje! Aproveite o dia ou adicione novas tarefas.");
        setIsSessionFinished(true);
        console.log("SEISOPage - fetchTasksForToday: No tasks, setting isSessionFinished to true.");
      }
      setAllTasks(filteredTasks);
    } else {
      showError("Não foi possível carregar as tarefas do Todoist.");
      navigate("/main-menu");
      console.log("SEISOPage - fetchTasksForToday: API call failed, navigating to main-menu.");
    }
    setLoading(false);
    console.log("SEISOPage - fetchTasksForToday: Finished, setLoading(false).");
  }, [navigate]);

  useEffect(() => {
    fetchTasksForToday();
  }, [fetchTasksForToday]);

  useEffect(() => {
    if (currentTask) {
      const timeInSeconds = parseTimeEstimate(currentTask);
      setCurrentTaskEstimate(timeInSeconds);

      setPomodoroTimeLeft(POMODORO_DURATION);
      setIsPomodoroActive(false);
      setIsPomodoroPaused(false);
      if (pomodoroTimerRef.current) clearInterval(pomodoroTimerRef.current);

      setTaskTimeElapsed(0);
      setIsTaskActive(false);
      setIsTaskPaused(false);
      if (taskTimerRef.current) clearInterval(taskTimerRef.current);
    }
  }, [currentTaskIndex, currentTask]);

  useEffect(() => {
    if (isPomodoroActive && pomodoroTimeLeft > 0) {
      pomodoroTimerRef.current = setInterval(() => {
        setPomodoroTimeLeft((prevTime) => prevTime - 1);
      }, 1000);
    } else if (pomodoroTimeLeft === 0 && isPomodoroActive) {
      setIsPomodoroActive(false);
      showSuccess("Pomodoro concluído! Hora de uma pausa.");
      if (pomodoroTimerRef.current) clearInterval(pomodoroTimerRef.current);
    }

    return () => {
      if (pomodoroTimerRef.current) clearInterval(pomodoroTimerRef.current);
    };
  }, [isPomodoroActive, pomodoroTimeLeft]);

  useEffect(() => {
    if (isTaskActive) {
      taskTimerRef.current = setInterval(() => {
        setTaskTimeElapsed((prevTime) => prevTime + 1);
      }, 1000);
    }

    return () => {
      if (taskTimerRef.current) clearInterval(taskTimerRef.current);
    };
  }, [isTaskActive]);

  const startPomodoro = useCallback(() => {
    if (pomodoroTimeLeft > 0) {
      setIsPomodoroActive(true);
      setIsPomodoroPaused(false);
    }
  }, [pomodoroTimeLeft]);

  const pausePomodoro = useCallback(() => {
    setIsPomodoroActive(false);
    setIsPomodoroPaused(true);
    if (pomodoroTimerRef.current) clearInterval(pomodoroTimerRef.current);
  }, []);

  const resetPomodoro = useCallback(() => {
    setIsPomodoroActive(false);
    setIsPomodoroPaused(false);
    setPomodoroTimeLeft(POMODORO_DURATION);
    if (pomodoroTimerRef.current) clearInterval(pomodoroTimerRef.current);
  }, []);

  const startTaskTimer = useCallback(() => {
    setIsTaskActive(true);
    setIsTaskPaused(false);
  }, []);

  const pauseTaskTimer = useCallback(() => {
    setIsTaskActive(false);
    setIsTaskPaused(true);
    if (taskTimerRef.current) clearInterval(taskTimerRef.current);
  }, []);

  const resetTaskTimer = useCallback(() => {
    setIsTaskActive(false);
    setIsTaskPaused(false);
    setTaskTimeElapsed(0);
    if (taskTimerRef.current) clearInterval(taskTimerRef.current);
  }, []);

  const addFifteenMinutes = useCallback(() => {
    setCurrentTaskEstimate((prevEstimate) => prevEstimate + 15 * 60);
    showSuccess("+15 minutos adicionados à estimativa da tarefa!");
  }, []);

  const stopAllTimers = useCallback(() => {
    setIsPomodoroActive(false);
    setIsPomodoroPaused(false);
    if (pomodoroTimerRef.current) clearInterval(pomodoroTimerRef.current);

    setIsTaskActive(false);
    setIsTaskPaused(false);
    if (taskTimerRef.current) clearInterval(taskTimerRef.current);
  }, []);

  const moveToNextTask = useCallback(() => {
    stopAllTimers();
    if (currentTaskIndex < totalTasks - 1) {
      setCurrentTaskIndex(currentTaskIndex + 1);
      setShowCelebration(false);
    } else {
      setIsSessionFinished(true);
      setShowCelebration(false);
    }
  }, [currentTaskIndex, totalTasks, stopAllTimers]);

  const handleCompleteTask = useCallback(async () => {
    if (currentTask) {
      const success = await handleApiCall(() => completeTask(currentTask.id), "Concluindo tarefa...", "Tarefa concluída no Todoist!");
      if (success) {
        setTasksCompleted(tasksCompleted + 1);
        setShowCelebration(true);
        stopAllTimers();
      } else {
        showError("Falha ao concluir a tarefa no Todoist.");
      }
    }
  }, [currentTask, stopAllTimers]);

  const handleSkipTask = useCallback(() => {
    showSuccess("Tarefa pulada.");
    moveToNextTask();
  }, [moveToNextTask]);

  const handleContinueAfterCelebration = useCallback(() => {
    moveToNextTask();
  }, [moveToNextTask]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (loading || showCelebration || isSessionFinished || !currentTask) return;

      if (event.key === 'c' || event.key === 'C') {
        event.preventDefault();
        handleCompleteTask();
      } else if (event.key === 'p' || event.key === 'P') {
        event.preventDefault();
        handleSkipTask();
      } else if (event.key === 'a' || event.key === 'A') {
        event.preventDefault();
        addFifteenMinutes();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [loading, showCelebration, isSessionFinished, currentTask, handleCompleteTask, handleSkipTask, addFifteenMinutes]);

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

  const taskProgressValue = totalTasks > 0 ? (currentTaskIndex / totalTasks) * 100 : 0;
  const pomodoroProgressValue = ((POMODORO_DURATION - pomodoroTimeLeft) / POMODORO_DURATION) * 100;
  const taskTimeProgressValue = currentTaskEstimate > 0 ? (taskTimeElapsed / currentTaskEstimate) * 100 : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-orange-100 p-4">
        <p className="text-lg text-orange-600">Carregando tarefas para hoje...</p>
      </div>
    );
  }

  if (isSessionFinished) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-orange-100 p-4">
        <Card className="w-full max-w-md shadow-lg bg-white/80 backdrop-blur-sm p-6 text-center space-y-4">
          <CardTitle className="text-3xl font-bold text-gray-800">Sessão Concluída!</CardTitle>
          <CardDescription className="text-lg text-gray-600">
            Você concluiu {tasksCompleted} de {totalTasks} tarefas.
          </CardDescription>
          <Button onClick={() => navigate("/main-menu")} className="mt-4 bg-blue-600 hover:bg-blue-700">
            Voltar ao Menu Principal
          </Button>
        </Card>
        <MadeWithDyad />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-orange-100 p-4">
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

      <Card className="w-full max-w-3xl shadow-lg bg-white/80 backdrop-blur-sm p-6">
        {showCelebration ? (
          <div className="text-center space-y-4">
            <CardTitle className="text-4xl font-bold text-green-600">Parabéns! 🎉</CardTitle>
            <CardDescription className="text-2xl text-gray-800">Tarefa concluída!</CardDescription>
            <Button onClick={handleContinueAfterCelebration} className="mt-4 bg-blue-600 hover:bg-blue-700">
              Continuar
            </Button>
          </div>
        ) : (
          currentTask && (
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
                    Vencimento: <span className="font-medium text-gray-700">{formatDueDate(currentTask.due.date)}</span>
                  </p>
                )}
                {currentTask.deadline && (
                  <p className="text-sm text-gray-500">
                    Data Limite: <span className="font-medium text-gray-700">{formatDueDate(currentTask.deadline)}</span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <div className="flex flex-col items-center space-y-3 p-4 border rounded-lg bg-red-50/50">
                  <h3 className="text-xl font-bold text-red-700">Pomodoro</h3>
                  <div className="text-6xl font-bold text-red-800">
                    {formatTime(pomodoroTimeLeft)}
                  </div>
                  <Progress value={pomodoroProgressValue} className="w-full h-2 bg-red-200 [&>*]:bg-red-600" />
                  <div className="flex space-x-2">
                    {!isPomodoroActive && !isPomodoroPaused && (
                      <Button onClick={startPomodoro} className="bg-green-600 hover:bg-green-700 text-white">
                        <Play className="h-5 w-5" />
                      </Button>
                    )}
                    {isPomodoroActive && (
                      <Button onClick={pausePomodoro} className="bg-yellow-600 hover:bg-yellow-700 text-white">
                        <Pause className="h-5 w-5" />
                      </Button>
                    )}
                    {isPomodoroPaused && (
                      <Button onClick={startPomodoro} className="bg-green-600 hover:bg-green-700 text-white">
                        <Play className="h-5 w-5" />
                      </Button>
                    )}
                    <Button onClick={resetPomodoro} className="bg-gray-600 hover:bg-gray-700 text-white">
                      <Square className="h-5 w-5" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col items-center space-y-3 p-4 border rounded-lg bg-blue-50/50">
                  <h3 className="text-xl font-bold text-blue-700">Tempo na Tarefa</h3>
                  <div className="text-6xl font-bold text-blue-800">
                    {formatTime(taskTimeElapsed)}
                  </div>
                  <Progress value={taskTimeProgressValue} className="w-full h-2 bg-blue-200 [&>*]:bg-blue-600" />
                  <div className="flex space-x-2">
                    {!isTaskActive && !isTaskPaused && (
                      <Button onClick={startTaskTimer} className="bg-green-600 hover:bg-green-700 text-white">
                        <Play className="h-5 w-5" />
                      </Button>
                    )}
                    {isTaskActive && (
                      <Button onClick={pauseTaskTimer} className="bg-yellow-600 hover:bg-yellow-700 text-white">
                        <Pause className="h-5 w-5" />
                      </Button>
                    )}
                    {isTaskPaused && (
                      <Button onClick={startTaskTimer} className="bg-green-600 hover:bg-green-700 text-white">
                        <Play className="h-5 w-5" />
                      </Button>
                    )}
                    <Button onClick={resetTaskTimer} className="bg-gray-600 hover:bg-gray-700 text-white">
                      <Square className="h-5 w-5" />
                    </Button>
                  </div>
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
                  onClick={addFifteenMinutes}
                  className="bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 px-4 rounded-md transition-colors flex items-center"
                >
                  <TimerIcon className="mr-2 h-5 w-5" /> +15MIN (A)
                </Button>
              </div>
            </div>
          )
        )}
        {!showCelebration && !isSessionFinished && (
          <CardFooter className="flex flex-col items-center p-6 border-t mt-6">
            <p className="text-sm text-gray-600 mb-2">
              Tarefa {currentTaskIndex + 1} de {totalTasks}
            </p>
            <Progress value={taskProgressValue} className="w-full h-2 bg-orange-200 [&>*]:bg-orange-600" />
          </CardFooter>
        )}
      </Card>
      <MadeWithDyad />
    </div>
  );
};

export default SEISOPage;