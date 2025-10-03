"use client";

import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Play, Pause, Square, Check, SkipForward, Timer as TimerIcon } from "lucide-react";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { showSuccess } from "@/utils/toast";

interface Task {
  id: string;
  title: string;
  priority: "P1" | "P2";
  time: string; // e.g., "25min", "45min"
}

const fakeTasks: Task[] = [
  { id: "1", title: "Responder emails urgentes", priority: "P1", time: "25min" },
  { id: "2", title: "Revisar documento", priority: "P1", time: "45min" },
  { id: "3", title: "Ligar para cliente", priority: "P2", time: "15min" },
  { id: "4", title: "Organizar arquivos", priority: "P2", time: "30min" },
];

const POMODORO_DURATION = 25 * 60; // 25 minutes in seconds

const parseTime = (timeStr: string): number => {
  const match = timeStr.match(/(\d+)(min|h)/);
  if (!match) return 0;
  const value = parseInt(match[1]);
  const unit = match[2];
  if (unit === "min") {
    return value * 60; // seconds
  } else if (unit === "h") {
    return value * 60 * 60; // seconds
  }
  return 0;
};

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
};

const SEISOPage = () => {
  const navigate = useNavigate();
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const [isSessionFinished, setIsSessionFinished] = useState(false);

  // Pomodoro Timer States
  const [pomodoroTimeLeft, setPomodoroTimeLeft] = useState(POMODORO_DURATION);
  const [isPomodoroActive, setIsPomodoroActive] = useState(false);
  const [isPomodoroPaused, setIsPomodoroPaused] = useState(false);
  const pomodoroTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Task Timer States
  const [taskTimeElapsed, setTaskTimeElapsed] = useState(0);
  const [isTaskActive, setIsTaskActive] = useState(false);
  const [isTaskPaused, setIsTaskPaused] = useState(false);
  const taskTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Task specific data (for display and +15min logic)
  const [currentTaskEstimate, setCurrentTaskEstimate] = useState(0); // in seconds

  const totalTasks = fakeTasks.length;
  const currentTask = fakeTasks[currentTaskIndex];

  // Initialize timers and task estimate when task changes or page loads
  useEffect(() => {
    if (currentTask) {
      const timeInSeconds = parseTime(currentTask.time);
      setCurrentTaskEstimate(timeInSeconds);

      // Reset Pomodoro
      setPomodoroTimeLeft(POMODORO_DURATION);
      setIsPomodoroActive(false);
      setIsPomodoroPaused(false);
      if (pomodoroTimerRef.current) clearInterval(pomodoroTimerRef.current);

      // Reset Task Timer
      setTaskTimeElapsed(0);
      setIsTaskActive(false);
      setIsTaskPaused(false);
      if (taskTimerRef.current) clearInterval(taskTimerRef.current);
    }
  }, [currentTaskIndex, currentTask]);

  // Pomodoro Timer Countdown Logic
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

  // Task Timer Count-up Logic
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

  // Pomodoro Controls
  const startPomodoro = () => {
    if (pomodoroTimeLeft > 0) {
      setIsPomodoroActive(true);
      setIsPomodoroPaused(false);
    }
  };

  const pausePomodoro = () => {
    setIsPomodoroActive(false);
    setIsPomodoroPaused(true);
    if (pomodoroTimerRef.current) clearInterval(pomodoroTimerRef.current);
  };

  const resetPomodoro = () => {
    setIsPomodoroActive(false);
    setIsPomodoroPaused(false);
    setPomodoroTimeLeft(POMODORO_DURATION);
    if (pomodoroTimerRef.current) clearInterval(pomodoroTimerRef.current);
  };

  // Task Timer Controls
  const startTaskTimer = () => {
    setIsTaskActive(true);
    setIsTaskPaused(false);
  };

  const pauseTaskTimer = () => {
    setIsTaskActive(false);
    setIsTaskPaused(true);
    if (taskTimerRef.current) clearInterval(taskTimerRef.current);
  };

  const resetTaskTimer = () => {
    setIsTaskActive(false);
    setIsTaskPaused(false);
    setTaskTimeElapsed(0);
    if (taskTimerRef.current) clearInterval(taskTimerRef.current);
  };

  const addFifteenMinutes = () => {
    setCurrentTaskEstimate((prevEstimate) => prevEstimate + 15 * 60);
    showSuccess("+15 minutos adicionados à estimativa da tarefa!");
  };

  const stopAllTimers = () => {
    setIsPomodoroActive(false);
    setIsPomodoroPaused(false);
    if (pomodoroTimerRef.current) clearInterval(pomodoroTimerRef.current);

    setIsTaskActive(false);
    setIsTaskPaused(false);
    if (taskTimerRef.current) clearInterval(taskTimerRef.current);
  };

  const moveToNextTask = () => {
    stopAllTimers();
    if (currentTaskIndex < totalTasks - 1) {
      setCurrentTaskIndex(currentTaskIndex + 1);
      setShowCelebration(false);
    } else {
      setIsSessionFinished(true);
      setShowCelebration(false);
    }
  };

  const handleCompleteTask = () => {
    setTasksCompleted(tasksCompleted + 1);
    setShowCelebration(true);
    stopAllTimers();
    // The celebration will handle moving to the next task after a delay or user action
  };

  const handleSkipTask = () => {
    showSuccess("Tarefa pulada.");
    moveToNextTask();
  };

  const handleContinueAfterCelebration = () => {
    moveToNextTask();
  };

  const getPriorityColor = (priority: "P1" | "P2") => {
    return priority === "P1" ? "text-red-600" : "text-yellow-600";
  };

  const taskProgressValue = totalTasks > 0 ? (currentTaskIndex / totalTasks) * 100 : 0;
  const pomodoroProgressValue = ((POMODORO_DURATION - pomodoroTimeLeft) / POMODORO_DURATION) * 100;
  const taskTimeProgressValue = currentTaskEstimate > 0 ? (taskTimeElapsed / currentTaskEstimate) * 100 : 0;


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
          <div className="w-20"></div> {/* Placeholder para alinhar o título */}
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
                <CardTitle className="text-3xl font-bold text-gray-800 mb-2">{currentTask.title}</CardTitle>
                <p className={`text-lg font-semibold ${getPriorityColor(currentTask.priority)} mb-1`}>
                  Prioridade: {currentTask.priority}
                </p>
                <p className="text-md text-gray-600">
                  Estimativa original: <span className="font-medium">{formatTime(currentTaskEstimate)} estimados</span>
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                {/* Pomodoro Timer */}
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

                {/* Task Timer */}
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
                  <Check className="mr-2 h-5 w-5" /> CONCLUÍDA
                </Button>
                <Button
                  onClick={handleSkipTask}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition-colors flex items-center"
                >
                  <SkipForward className="mr-2 h-5 w-5" /> PRÓXIMA
                </Button>
                <Button
                  onClick={addFifteenMinutes}
                  className="bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 px-4 rounded-md transition-colors flex items-center"
                >
                  <TimerIcon className="mr-2 h-5 w-5" /> +15MIN
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