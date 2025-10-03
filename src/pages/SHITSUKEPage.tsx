"use client";

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Trash2, Archive, ArrowUpCircle, BarChart2 } from "lucide-react";
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
import { showSuccess } from "@/utils/toast";

interface TaskP3 {
  id: string;
  title: string;
  days_stopped: number;
  project: string;
  description?: string;
}

const fakeTasksP3: TaskP3[] = [
  { id: "1", title: "Organizar fotos antigas", days_stopped: 45, project: "Pessoal", description: "Separar por ano e evento, deletar duplicadas." },
  { id: "2", title: "Ler livro sobre produtividade", days_stopped: 23, project: "Desenvolvimento", description: "Livro 'Getting Things Done' de David Allen." },
  { id: "3", title: "Pintar parede da sala", days_stopped: 67, project: "Casa", description: "Comprar tinta e materiais, chamar pintor." },
  { id: "4", title: "Aprender francês", days_stopped: 89, project: "Pessoal", description: "Revisar Duolingo e aulas online." },
  { id: "5", title: "Backup do computador", days_stopped: 12, project: "Tecnologia", description: "Fazer backup completo para HD externo." },
];

const SHITSUKEPage = () => {
  const navigate = useNavigate();
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [deletedTasksCount, setDeletedTasksCount] = useState(0);
  const [keptTasksCount, setKeptTasksCount] = useState(0);
  const [promotedTasksCount, setPromotedTasksCount] = useState(0);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  const totalTasks = fakeTasksP3.length;
  const currentTask = fakeTasksP3[currentTaskIndex];

  const moveToNextTask = () => {
    if (currentTaskIndex < totalTasks - 1) {
      setCurrentTaskIndex(currentTaskIndex + 1);
    } else {
      setShowSummary(true);
    }
  };

  const handleDelete = () => {
    setIsConfirmationOpen(true);
  };

  const confirmDelete = () => {
    setDeletedTasksCount(deletedTasksCount + 1);
    setIsConfirmationOpen(false);
    showSuccess("Tarefa deletada!");
    moveToNextTask();
  };

  const handleKeep = () => {
    setKeptTasksCount(keptTasksCount + 1);
    showSuccess("Tarefa mantida em P3.");
    moveToNextTask();
  };

  const handlePromote = () => {
    setPromotedTasksCount(promotedTasksCount + 1);
    showSuccess("Tarefa promovida para revisão!");
    moveToNextTask();
  };

  const handleRunSeiton = () => {
    navigate("/5s/seiton");
  };

  const progressValue = totalTasks > 0 ? ((currentTaskIndex + (showSummary ? 1 : 0)) / totalTasks) * 100 : 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-red-100 p-4">
      <div className="w-full max-w-3xl mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={() => navigate("/main-menu")} className="text-red-800 hover:bg-red-200">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <h1 className="text-4xl font-extrabold text-red-800 text-center flex-grow">
            SHITSUKE - Revisão Semanal
          </h1>
          <div className="w-20"></div> {/* Placeholder para alinhar o título */}
        </div>
        <p className="text-xl text-red-700 text-center mb-8">
          Faxina profunda do seu sistema
        </p>
      </div>

      <Card className="w-full max-w-md shadow-lg bg-white/80 backdrop-blur-sm p-6">
        {showSummary ? (
          <div className="text-center space-y-6">
            <CardTitle className="text-3xl font-bold text-gray-800">📊 Faxina Semanal Concluída!</CardTitle>
            <div className="space-y-2 text-lg text-gray-700">
              <p className="flex items-center justify-center gap-2"><Trash2 className="h-5 w-5 text-red-600" /> Deletadas: <span className="font-semibold">{deletedTasksCount}</span> tarefas</p>
              <p className="flex items-center justify-center gap-2"><Archive className="h-5 w-5 text-yellow-600" /> Mantidas: <span className="font-semibold">{keptTasksCount}</span> tarefas</p>
              <p className="flex items-center justify-center gap-2"><ArrowUpCircle className="h-5 w-5 text-green-600" /> Promovidas: <span className="font-semibold">{promotedTasksCount}</span> tarefas</p>
            </div>
            <Button onClick={handleRunSeiton} className="mt-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-md transition-colors flex items-center justify-center w-full">
              <BarChart2 className="mr-2 h-5 w-5" /> RODAR SEITON AGORA?
            </Button>
            <Button onClick={() => navigate("/main-menu")} variant="outline" className="mt-4 w-full text-gray-700 hover:text-gray-900 border-gray-300 hover:border-gray-400 bg-white/70 backdrop-blur-sm">
              Voltar ao Menu Principal
            </Button>
          </div>
        ) : (
          currentTask && (
            <div className="space-y-6">
              <div className="text-center">
                <CardTitle className="text-3xl font-bold text-gray-800 mb-2">{currentTask.title}</CardTitle>
                <p className="text-lg text-gray-600 mb-1">
                  ⏰ Parada há <span className="font-semibold">{currentTask.days_stopped}</span> dias
                </p>
                <p className="text-md text-gray-500">
                  Projeto: <span className="font-medium text-gray-700">{currentTask.project}</span>
                </p>
                {currentTask.description && (
                  <CardDescription className="text-gray-700 mt-2">
                    {currentTask.description}
                  </CardDescription>
                )}
              </div>

              <div className="flex flex-col space-y-4 mt-6">
                <Button
                  onClick={handleDelete}
                  className="bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-md transition-colors flex flex-col items-center h-auto"
                >
                  <Trash2 className="h-5 w-5 mb-1" /> DELETAR
                  <span className="text-xs opacity-80">Esta tarefa não faz mais sentido</span>
                </Button>
                <Button
                  onClick={handleKeep}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-3 rounded-md transition-colors flex flex-col items-center h-auto"
                >
                  <Archive className="h-5 w-5 mb-1" /> MANTER EM P3
                  <span className="text-xs opacity-80">Manter no backlog por enquanto</span>
                </Button>
                <Button
                  onClick={handlePromote}
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-md transition-colors flex flex-col items-center h-auto"
                >
                  <ArrowUpCircle className="h-5 w-5 mb-1" /> PROMOVER
                  <span className="text-xs opacity-80">Quero priorizar esta tarefa</span>
                </Button>
              </div>
            </div>
          )
        )}
        {!showSummary && (
          <CardFooter className="flex flex-col items-center p-6 border-t mt-6">
            <p className="text-sm text-gray-600 mb-2">
              Tarefa P3: {currentTaskIndex + 1} de {totalTasks}
            </p>
            <Progress value={progressValue} className="w-full h-2 bg-red-200 [&>*]:bg-red-600" />
            <p className="text-xs text-gray-500 mt-1">Revisando tarefas antigas...</p>
          </CardFooter>
        )}
      </Card>

      <AlertDialog open={isConfirmationOpen} onOpenChange={setIsConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja deletar esta tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A tarefa será removida permanentemente.
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

export default SHITSUKEPage;