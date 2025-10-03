"use client";

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Check, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MadeWithDyad } from "@/components/made-with-dyad";

interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate?: string | null;
  project: string;
}

const fakeTasks: Task[] = [
  { id: "1", title: "Comprar leite", project: "Casa", dueDate: "2025-01-05" },
  { id: "2", title: "Revisar relatório", project: "Trabalho", dueDate: "2025-01-06" },
  { id: "3", title: "Ligar para dentista", project: "Pessoal", dueDate: null },
  { id: "4", title: "Pagar contas", project: "Finanças", dueDate: "2025-01-10" },
  { id: "5", title: "Agendar reunião", project: "Trabalho", description: "Reunião com a equipe de marketing", dueDate: "2025-01-08" },
  { id: "6", title: "Estudar React", project: "Aprendizado", dueDate: null },
];

const SEIRIPage = () => {
  const navigate = useNavigate();
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [keptTasksCount, setKeptTasksCount] = useState(0);
  const [deletedTasksCount, setDeletedTasksCount] = useState(0);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  const totalTasks = fakeTasks.length;
  const currentTask = fakeTasks[currentTaskIndex];

  const moveToNextTask = () => {
    if (currentTaskIndex < totalTasks - 1) {
      setCurrentTaskIndex(currentTaskIndex + 1);
    } else {
      setShowSummary(true);
    }
  };

  const handleKeep = () => {
    setKeptTasksCount(keptTasksCount + 1);
    moveToNextTask();
  };

  const handleDelete = () => {
    setIsConfirmationOpen(true);
  };

  const confirmDelete = () => {
    setDeletedTasksCount(deletedTasksCount + 1);
    setIsConfirmationOpen(false);
    moveToNextTask();
  };

  const progressValue = totalTasks > 0 ? ((currentTaskIndex + (showSummary ? 1 : 0)) / totalTasks) * 100 : 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-green-100 p-4">
      <div className="w-full max-w-3xl mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={() => navigate("/main-menu")} className="text-green-800 hover:bg-green-200">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <h1 className="text-4xl font-extrabold text-green-800 text-center flex-grow">
            SEIRI - Faxina do Backlog
          </h1>
          <div className-="w-20"></div> {/* Placeholder para alinhar o título */}
        </div>
        <p className="text-xl text-green-700 text-center mb-8">
          Revise cada tarefa: manter ou deletar?
        </p>
      </div>

      <Card className="w-full max-w-md shadow-lg bg-white/80 backdrop-blur-sm">
        <CardContent className="p-6">
          {showSummary ? (
            <div className="text-center space-y-4">
              <CardTitle className="text-2xl font-bold text-gray-800">Revisão Concluída!</CardTitle>
              <CardDescription className="text-lg text-gray-600">
                Você revisou {totalTasks} tarefas.
              </CardDescription>
              <p className="text-green-600 font-semibold">Manteve: {keptTasksCount}</p>
              <p className="text-red-600 font-semibold">Deletou: {deletedTasksCount}</p>
              <Button onClick={() => navigate("/main-menu")} className="mt-4 bg-blue-600 hover:bg-blue-700">
                Voltar ao Menu Principal
              </Button>
            </div>
          ) : (
            currentTask && (
              <div className="space-y-6">
                <div className="text-center">
                  <CardTitle className="text-3xl font-bold text-gray-800 mb-2">{currentTask.title}</CardTitle>
                  {currentTask.description && (
                    <CardDescription className="text-gray-700 mb-2">
                      {currentTask.description}
                    </CardDescription>
                  )}
                  <p className="text-sm text-gray-500">
                    Projeto: <span className="font-medium text-gray-700">{currentTask.project}</span>
                  </p>
                  {currentTask.dueDate && (
                    <p className="text-sm text-gray-500">
                      Vencimento: <span className="font-medium text-gray-700">{new Date(currentTask.dueDate).toLocaleDateString()}</span>
                    </p>
                  )}
                </div>

                <div className="flex justify-center space-x-4 mt-6">
                  <Button
                    onClick={handleDelete}
                    className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-6 rounded-md transition-colors flex items-center"
                  >
                    <X className="mr-2 h-5 w-5" /> DELETAR
                  </Button>
                  <Button
                    onClick={handleKeep}
                    className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-md transition-colors flex items-center"
                  >
                    <Check className="mr-2 h-5 w-5" /> MANTER
                  </Button>
                </div>
              </div>
            )
          )}
        </CardContent>
        {!showSummary && (
          <CardFooter className="flex flex-col items-center p-6 border-t mt-6">
            <p className="text-sm text-gray-600 mb-2">
              Tarefa {currentTaskIndex + 1} de {totalTasks}
            </p>
            <Progress value={progressValue} className="w-full h-2 bg-green-200 [&>*]:bg-green-600" />
          </CardFooter>
        )}
      </Card>

      <AlertDialog open={isConfirmationOpen} onOpenChange={setIsConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja deletar esta tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A tarefa será removida do seu backlog.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <MadeWithDyad />
    </div>
  );
};

export default SEIRIPage;