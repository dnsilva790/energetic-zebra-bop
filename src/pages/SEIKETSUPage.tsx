"use client";

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, CheckCircle2, Clock, Hourglass, Coffee, CalendarCheck } from "lucide-react";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { showSuccess } from "@/utils/toast";

interface Task {
  id: string;
  title: string;
  priority: "P1" | "P2" | "P3";
}

const fakeSummary = {
  concluidas: 5,
  pendentes: 3,
  tempo_total: "4h 30min",
  pomodoros: 9,
};

const fakePendingTasks: Task[] = [
  { id: "1", title: "Revisar contrato", priority: "P1" },
  { id: "2", title: "Ligar para cliente", priority: "P2" },
  { id: "3", title: "Comprar material escritório", priority: "P2" },
  { id: "4", title: "Estudar novo framework", priority: "P3" },
];

const motivationalMessages = [
  "Bom trabalho hoje! 🌟",
  "Cada pequeno passo conta! 💪",
  "Amanhã é um novo começo! 🌅",
  "Você está progredindo! 🚀",
  "Orgulhe-se do seu esforço! ✨",
  "Continue firme! 🌈",
];

const SEIKETSUPage = () => {
  const navigate = useNavigate();
  const [selectedPendingTasks, setSelectedPendingTasks] = useState<string[]>([]);
  const [motivationalMessage, setMotivationalMessage] = useState("");

  useEffect(() => {
    const randomIndex = Math.floor(Math.random() * motivationalMessages.length);
    setMotivationalMessage(motivationalMessages[randomIndex]);
  }, []);

  const handleCheckboxChange = (taskId: string, checked: boolean) => {
    setSelectedPendingTasks((prev) =>
      checked ? [...prev, taskId] : prev.filter((id) => id !== taskId)
    );
  };

  const handleReprogramSelected = () => {
    if (selectedPendingTasks.length === 0) {
      showSuccess("Nenhuma tarefa selecionada para reprogramar.");
      return;
    }
    const reprogrammedTitles = fakePendingTasks
      .filter((task) => selectedPendingTasks.includes(task.id))
      .map((task) => task.title);
    showSuccess(`Tarefas reprogramadas: ${reprogrammedTitles.join(", ")}`);
    setSelectedPendingTasks([]); // Clear selection after reprogramming
  };

  const getPriorityColor = (priority: "P1" | "P2" | "P3") => {
    switch (priority) {
      case "P1":
        return "text-red-600";
      case "P2":
        return "text-yellow-600";
      case "P3":
        return "text-gray-600";
      default:
        return "text-gray-600";
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-purple-100 p-4">
      <div className="w-full max-w-3xl mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={() => navigate("/main-menu")} className="text-purple-800 hover:bg-purple-200">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <h1 className="text-4xl font-extrabold text-purple-800 text-center flex-grow">
            SEIKETSU - Revisar o Dia
          </h1>
          <div className="w-20"></div> {/* Placeholder para alinhar o título */}
        </div>
        <p className="text-xl text-purple-700 text-center mb-8">
          Como foi seu dia? Vamos preparar amanhã
        </p>
      </div>

      <Card className="w-full max-w-md shadow-lg bg-white/80 backdrop-blur-sm p-6 space-y-8">
        {/* Resumo do Dia */}
        <div className="text-center space-y-4">
          <CardTitle className="text-2xl font-bold text-gray-800">Resumo do Dia</CardTitle>
          <div className="grid grid-cols-2 gap-4 text-left">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <p className="text-lg text-gray-700">Concluídas: <span className="font-semibold">{fakeSummary.concluidas}</span></p>
            </div>
            <div className="flex items-center space-x-2">
              <Hourglass className="h-5 w-5 text-yellow-600" />
              <p className="text-lg text-gray-700">Pendentes: <span className="font-semibold">{fakeSummary.pendentes}</span></p>
            </div>
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-blue-600" />
              <p className="text-lg text-gray-700">Trabalhado: <span className="font-semibold">{fakeSummary.tempo_total}</span></p>
            </div>
            <div className="flex items-center space-x-2">
              <Coffee className="h-5 w-5 text-red-600" />
              <p className="text-lg text-gray-700">Pomodoros: <span className="font-semibold">{fakeSummary.pomodoros}</span></p>
            </div>
          </div>
        </div>

        {/* Lista de Pendentes */}
        <div className="space-y-4">
          <CardTitle className="text-2xl font-bold text-gray-800 text-center">Tarefas que ficaram pendentes:</CardTitle>
          <p className="text-gray-700 text-center mb-4">Quais dessas você quer tentar amanhã?</p>
          <div className="space-y-3">
            {fakePendingTasks.map((task) => (
              <div key={task.id} className="flex items-center space-x-3">
                <Checkbox
                  id={`task-${task.id}`}
                  checked={selectedPendingTasks.includes(task.id)}
                  onCheckedChange={(checked) => handleCheckboxChange(task.id, checked as boolean)}
                  className="h-5 w-5"
                />
                <label
                  htmlFor={`task-${task.id}`}
                  className={`text-lg font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${getPriorityColor(task.priority)}`}
                >
                  {task.title} ({task.priority})
                </label>
              </div>
            ))}
          </div>
          <Button
            onClick={handleReprogramSelected}
            className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-md transition-colors flex items-center justify-center"
          >
            <CalendarCheck className="mr-2 h-5 w-5" /> REPROGRAMAR SELECIONADAS
          </Button>
        </div>

        {/* Encerramento */}
        <div className="text-center space-y-4 pt-4 border-t">
          <CardDescription className="text-xl font-semibold text-gray-800">
            {motivationalMessage}
          </CardDescription>
          <Button onClick={() => navigate("/main-menu")} className="mt-4 bg-purple-600 hover:bg-purple-700">
            <ArrowLeft className="mr-2 h-4 w-4" /> VOLTAR AO MENU
          </Button>
        </div>
      </Card>
      <MadeWithDyad />
    </div>
  );
};

export default SEIKETSUPage;