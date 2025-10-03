"use client";

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { showSuccess } from "@/utils/toast";
import { MadeWithDyad } from "@/components/made-with-dyad";

interface Task {
  id: string;
  title: string;
  estimativa: string; // e.g., "2min", "2h", "30min"
}

const fakeTasks: Task[] = [
  { id: "1", title: "Responder email urgente", estimativa: "2min" },
  { id: "2", title: "Preparar apresentação", estimativa: "2h" },
  { id: "3", title: "Comprar presente aniversário", estimativa: "30min" },
  { id: "4", title: "Revisar contrato", estimativa: "1h" },
  { id: "5", title: "Agendar consulta médica", estimativa: "5min" },
  { id: "6", title: "Ligar para o banco", estimativa: "10min" },
  { id: "7", title: "Ler artigo técnico", estimativa: "45min" },
];

const isShortTask = (estimativa: string): boolean => {
  const match = estimativa.match(/(\d+)(min|h)/);
  if (!match) return false;
  const value = parseInt(match[1]);
  const unit = match[2];
  if (unit === "min") {
    return value <= 3;
  } else if (unit === "h") {
    return false; // Any hour task is > 3 minutes
  }
  return false;
};

const SEITONPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<"filter" | "execute" | "tournament" | "result">("filter");
  const [tasks] = useState<Task[]>(fakeTasks); // Original tasks
  const [currentFilterTaskIndex, setCurrentFilterTaskIndex] = useState(0);
  const [shortTasksToExecute, setShortTasksToExecute] = useState<Task[]>([]);
  const [longTasksForTournament, setLongTasksForTournament] = useState<Task[]>([]);
  const [executedCount, setExecutedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [currentExecuteTaskIndex, setCurrentExecuteTaskIndex] = useState(0);

  // Tournament specific states (user-guided insertion sort)
  const [tasksToPlace, setTasksToPlace] = useState<Task[]>([]); // Tasks from longTasksForTournament waiting to be placed
  const [rankedTasks, setRankedTasks] = useState<Task[]>([]); // The final sorted list
  const [currentTaskToPlace, setCurrentTaskToPlace] = useState<Task | null>(null); // The task currently being placed
  const [comparisonIndex, setComparisonIndex] = useState(0); // Index in rankedTasks for comparison

  // Helper to advance to the next step or task within a step
  const advanceStep = () => {
    if (step === "filter") {
      if (currentFilterTaskIndex < tasks.length - 1) {
        setCurrentFilterTaskIndex(currentFilterTaskIndex + 1);
      } else {
        // All tasks filtered
        if (shortTasksToExecute.length > 0) {
          setStep("execute");
          setCurrentExecuteTaskIndex(0); // Reset for execute step
        } else if (longTasksForTournament.length > 0) {
          setTasksToPlace([...longTasksForTournament]); // Initialize tasks for tournament
          setLongTasksForTournament([]); // Clear original list
          setStep("tournament");
        } else {
          setStep("result");
        }
      }
    } else if (step === "execute") {
      if (currentExecuteTaskIndex < shortTasksToExecute.length - 1) {
        setCurrentExecuteTaskIndex(currentExecuteTaskIndex + 1);
      } else {
        // All short tasks processed
        if (longTasksForTournament.length > 0) {
          setTasksToPlace([...longTasksForTournament]); // Initialize tasks for tournament
          setLongTasksForTournament([]); // Clear original list
          setStep("tournament");
        } else {
          setStep("result");
        }
      }
    }
  };

  // Effect to manage tournament flow
  useEffect(() => {
    if (step === "tournament") {
      if (!currentTaskToPlace && tasksToPlace.length > 0) {
        // Get next task to place
        setCurrentTaskToPlace(tasksToPlace.shift()!);
        setComparisonIndex(0);
      } else if (!currentTaskToPlace && tasksToPlace.length === 0) {
        // All tasks placed
        showSuccess("Ranking atualizado!");
        setStep("result");
      }
    }
  }, [step, currentTaskToPlace, tasksToPlace, rankedTasks]);

  // Effect to handle adding currentTaskToPlace to rankedTasks if it wins all comparisons
  useEffect(() => {
    if (step === "tournament" && currentTaskToPlace && comparisonIndex >= rankedTasks.length) {
      setRankedTasks((prev) => [...prev, currentTaskToPlace]); // Add to end
      setCurrentTaskToPlace(null); // Signal to get next task to place
    }
  }, [step, currentTaskToPlace, comparisonIndex, rankedTasks]);


  // Handlers for filter step
  const handleFilterSim = () => {
    setShortTasksToExecute((prev) => [...prev, tasks[currentFilterTaskIndex]]);
    advanceStep();
  };

  const handleFilterNao = () => {
    setLongTasksForTournament((prev) => [...prev, tasks[currentFilterTaskIndex]]);
    advanceStep();
  };

  // Handlers for execute step
  const handleExecutei = () => {
    setExecutedCount((prev) => prev + 1);
    // Remove the executed task from shortTasksToExecute
    setShortTasksToExecute((prev) => prev.filter((_, i) => i !== currentExecuteTaskIndex));
    advanceStep();
  };

  const handleNaoExecutei = () => {
    setSkippedCount((prev) => prev + 1);
    // Remove the skipped task from shortTasksToExecute
    setShortTasksToExecute((prev) => prev.filter((_, i) => i !== currentExecuteTaskIndex));
    advanceStep();
  };

  // Handlers for tournament step
  const handleTournamentPick = (chosenTask: Task) => {
    if (!currentTaskToPlace) return; // Should not happen

    if (chosenTask.id === currentTaskToPlace.id) {
      // currentTaskToPlace is more important than rankedTasks[comparisonIndex]
      setComparisonIndex((prev) => prev + 1);
    } else {
      // rankedTasks[comparisonIndex] is more important than currentTaskToPlace
      // Insert currentTaskToPlace before rankedTasks[comparisonIndex]
      setRankedTasks((prev) => {
        const newRanked = [...prev];
        newRanked.splice(comparisonIndex, 0, currentTaskToPlace);
        return newRanked;
      });
      setCurrentTaskToPlace(null); // Signal to get next task to place
    }
  };

  const currentFilterTask = tasks[currentFilterTaskIndex];
  const currentExecuteTask = shortTasksToExecute[currentExecuteTaskIndex];

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
          <div className="w-20"></div> {/* Placeholder para alinhar o título */}
        </div>
        <p className="text-xl text-blue-700 text-center mb-8">
          Priorize suas tarefas com torneio
        </p>
      </div>

      <Card className="w-full max-w-md shadow-lg bg-white/80 backdrop-blur-sm p-6">
        {step === "filter" && currentFilterTask && (
          <div className="text-center space-y-6">
            <CardTitle className="text-3xl font-bold text-gray-800">
              {currentFilterTask.title}
            </CardTitle>
            <CardDescription className="text-lg text-gray-700">
              Estimativa: {currentFilterTask.estimativa}
            </CardDescription>
            <p className="text-xl font-semibold text-gray-800">
              Esta tarefa leva menos de 3 minutos?
            </p>
            <div className="flex justify-center space-x-4 mt-6">
              <Button onClick={handleFilterNao} className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-6 rounded-md transition-colors">
                NÃO
              </Button>
              <Button onClick={handleFilterSim} className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-md transition-colors">
                SIM
              </Button>
            </div>
            <CardFooter className="text-sm text-gray-500 mt-4">
              Tarefa {currentFilterTaskIndex + 1} de {tasks.length}
            </CardFooter>
          </div>
        )}

        {step === "execute" && currentExecuteTask && (
          <div className="text-center space-y-6">
            <CardTitle className="text-3xl font-bold text-gray-800">
              {currentExecuteTask.title}
            </CardTitle>
            <CardDescription className="text-lg text-gray-700">
              Estimativa: {currentExecuteTask.estimativa}
            </CardDescription>
            <p className="text-xl font-semibold text-blue-800">
              Execute agora!
            </p>
            <div className="flex justify-center space-x-4 mt-6">
              <Button onClick={handleNaoExecutei} className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-6 rounded-md transition-colors">
                NÃO EXECUTEI
              </Button>
              <Button onClick={handleExecutei} className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-md transition-colors">
                EXECUTEI
              </Button>
            </div>
            <CardFooter className="text-sm text-gray-500 mt-4">
              Tarefa {currentExecuteTaskIndex + 1} de {shortTasksToExecute.length} (curtas)
            </CardFooter>
          </div>
        )}

        {step === "tournament" && currentTaskToPlace && rankedTasks[comparisonIndex] && (
          <div className="text-center space-y-6">
            <CardTitle className="text-3xl font-bold text-gray-800 mb-4">
              Qual é mais importante agora?
            </CardTitle>
            <div className="flex flex-col space-y-4">
              <Button
                onClick={() => handleTournamentPick(currentTaskToPlace)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-md transition-colors text-lg h-auto"
              >
                {currentTaskToPlace.title} ({currentTaskToPlace.estimativa})
              </Button>
              <p className="text-lg text-gray-600 font-medium">OU</p>
              <Button
                onClick={() => handleTournamentPick(rankedTasks[comparisonIndex])}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-md transition-colors text-lg h-auto"
              >
                {rankedTasks[comparisonIndex].title} ({rankedTasks[comparisonIndex].estimativa})
              </Button>
            </div>
            <CardFooter className="text-sm text-gray-500 mt-4">
              Comparando {currentTaskToPlace.title} com {rankedTasks[comparisonIndex].title}
            </CardFooter>
          </div>
        )}

        {step === "tournament" && currentTaskToPlace && !rankedTasks[comparisonIndex] && (
          <div className="text-center space-y-6">
            <CardTitle className="text-3xl font-bold text-gray-800 mb-4">
              Qual é mais importante agora?
            </CardTitle>
            <p className="text-xl font-semibold text-gray-800">
              {currentTaskToPlace.title} ({currentTaskToPlace.estimativa})
            </p>
            <CardDescription className="text-lg text-gray-700">
              Esta tarefa é mais importante que todas as outras que você já priorizou.
            </CardDescription>
            <Button
              onClick={() => {
                setRankedTasks((prev) => [...prev, currentTaskToPlace]);
                setCurrentTaskToPlace(null);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-md transition-colors"
            >
              Adicionar ao topo da prioridade
            </Button>
            <CardFooter className="text-sm text-gray-500 mt-4">
              Posicionando {currentTaskToPlace.title}
            </CardFooter>
          </div>
        )}

        {step === "result" && (
          <div className="text-center space-y-4">
            <CardTitle className="text-2xl font-bold text-gray-800">Planejamento Concluído!</CardTitle>
            <CardDescription className="text-lg text-gray-600">
              Suas tarefas foram priorizadas.
            </CardDescription>
            <p className="text-green-600 font-semibold">Tarefas executadas (3min): {executedCount}</p>
            <p className="text-red-600 font-semibold">Tarefas puladas (3min): {skippedCount}</p>

            <h3 className="text-xl font-bold text-gray-800 mt-6 mb-2">Ranking de Prioridade:</h3>
            {rankedTasks.length > 0 ? (
              <ul className="list-decimal list-inside text-left mx-auto max-w-xs space-y-1">
                {rankedTasks.map((task, index) => (
                  <li key={task.id} className="text-gray-700">
                    {task.title} ({task.estimativa})
                    {index < 4 && <span className="text-blue-500 font-medium"> (P1)</span>}
                    {index >= 4 && index < 24 && <span className="text-purple-500 font-medium"> (P2)</span>}
                    {index >= 24 && <span className="text-gray-500 font-medium"> (P3)</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-600">Nenhuma tarefa para priorizar.</p>
            )}

            <Button onClick={() => navigate("/main-menu")} className="mt-4 bg-blue-600 hover:bg-blue-700">
              Voltar ao Menu Principal
            </Button>
          </div>
        )}
      </Card>
      <MadeWithDyad />
    </div>
  );
};

export default SEITONPage;