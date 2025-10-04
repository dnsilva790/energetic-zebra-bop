"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TodoistTask } from "@/lib/types";
import { showError } from "@/utils/toast";
import { ExternalLink } from "lucide-react"; // Importar o ícone de link externo

const SEITON_LAST_RANKING_KEY = 'seiton_last_ranking';
const DISPLAY_RANKING_LIMIT = 12; // Limite de tarefas a serem exibidas

interface SeitonRankingData {
  rankedTasks: TodoistTask[];
  p3Tasks: TodoistTask[];
}

const SeitonRankingDisplay: React.FC = () => {
  const [ranking, setRanking] = useState<SeitonRankingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const savedRanking = localStorage.getItem(SEITON_LAST_RANKING_KEY);
    if (savedRanking) {
      try {
        const parsedRanking: SeitonRankingData = JSON.parse(savedRanking);
        setRanking(parsedRanking);
      } catch (e) {
        console.error("Error parsing last Seiton ranking from localStorage:", e);
        showError("Erro ao carregar o último ranking do SEITON.");
        setRanking(null);
      }
    } else {
      setRanking(null);
    }
    setLoading(false);
  }, []);

  if (loading) {
    return <p className="text-center text-gray-600">Carregando ranking...</p>;
  }

  if (!ranking || (ranking.rankedTasks.length === 0 && ranking.p3Tasks.length === 0)) {
    return <p className="text-center text-gray-600">Nenhum ranking do SEITON encontrado.</p>;
  }

  const topRankedTasks = ranking.rankedTasks.slice(0, DISPLAY_RANKING_LIMIT);
  const p1Tasks = topRankedTasks.slice(0, 4);
  const p2Tasks = topRankedTasks.slice(4);

  return (
    <div className="space-y-6 text-center">
      <CardTitle className="text-3xl font-bold text-gray-800">Último Ranking SEITON</CardTitle>
      <CardDescription className="text-lg text-gray-600">
        Suas tarefas foram priorizadas na última sessão do SEITON.
      </CardDescription>

      {p1Tasks.length > 0 && (
        <div className="text-left p-4 border rounded-md bg-red-50/50">
          <h3 className="text-xl font-bold text-red-700 mb-2">P1 (Urgente)</h3>
          <ul className="list-disc list-inside space-y-1">
            {p1Tasks.map((task) => (
              <li key={task.id} className="text-gray-800 flex items-center justify-between">
                <span>{task.content}</span>
                <a
                  href={`https://todoist.com/app/task/${task.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-blue-600 transition-colors ml-2"
                  aria-label="Abrir no Todoist"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {p2Tasks.length > 0 && (
        <div className="text-left p-4 border rounded-md bg-yellow-50/50">
          <h3 className="text-xl font-bold text-yellow-700 mb-2">P2 (Alta)</h3>
          <ul className="list-disc list-inside space-y-1">
            {p2Tasks.map((task) => (
              <li key={task.id} className="text-gray-800 flex items-center justify-between">
                <span>{task.content}</span>
                <a
                  href={`https://todoist.com/app/task/${task.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-blue-600 transition-colors ml-2"
                  aria-label="Abrir no Todoist"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ranking.p3Tasks.length > 0 && (
        <div className="text-left p-4 border rounded-md bg-blue-50/50">
          <h3 className="text-xl font-bold text-blue-700 mb-2">P3 (Média)</h3>
          <ul className="list-disc list-inside space-y-1">
            {ranking.p3Tasks.map((task) => (
              <li key={task.id} className="text-gray-800 flex items-center justify-between">
                <span>{task.content}</span>
                <a
                  href={`https://todoist.com/app/task/${task.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-blue-600 transition-colors ml-2"
                  aria-label="Abrir no Todoist"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SeitonRankingDisplay;