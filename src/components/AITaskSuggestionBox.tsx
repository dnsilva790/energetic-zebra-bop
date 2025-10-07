"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, X, Lightbulb, CalendarDays, CheckCircle } from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";
import { getAISuggestedTimes, handleApiCall, updateTaskDueDate, getTasks } from "@/lib/todoistApi";
import { TodoistTask, AISuggestion } from "@/lib/types";
import { format, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface AITaskSuggestionBoxProps {
  task: TodoistTask;
  onClose: () => void;
  onTaskUpdated: () => void; // Callback para quando a tarefa for atualizada
}

const AITaskSuggestionBox: React.FC<AITaskSuggestionBoxProps> = ({ task, onClose, onTaskUpdated }) => {
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const currentDateTime = format(new Date(), "yyyy-MM-dd'T'HH:mm:ssXXX", { locale: ptBR });
      
      // Obter todas as tarefas ativas para a agenda existente
      const allActiveTasks = await handleApiCall(() => getTasks(), "Obtendo agenda para IA...");

      if (!allActiveTasks) {
        throw new Error("Não foi possível carregar a agenda para a IA.");
      }

      const result = await handleApiCall(
        () => getAISuggestedTimes(task.content, task.description || '', currentDateTime, allActiveTasks),
        "Gerando sugestões de horários com IA..."
      );

      if (result && result.sugestoes && result.sugestoes.length > 0) {
        setSuggestions(result.sugestoes.slice(0, 3)); // Limitar a 3 sugestões
        showSuccess("Sugestões de IA recebidas!");
      } else {
        setError("A IA não conseguiu gerar sugestões para esta tarefa.");
        showError("A IA não conseguiu gerar sugestões.");
      }
    } catch (err: any) {
      console.error("Erro ao buscar sugestões da IA:", err);
      setError(err.message || "Erro desconhecido ao buscar sugestões da IA.");
      showError(err.message || "Erro ao buscar sugestões da IA.");
    } finally {
      setLoading(false);
    }
  }, [task.content, task.description]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const handleApplySuggestion = useCallback(async (suggestion: AISuggestion) => {
    setLoading(true);
    try {
      const newDueDateString = `${suggestion.data}T${suggestion.hora}:00`;
      const updatedTask = await handleApiCall(
        () => updateTaskDueDate(task.id, newDueDateString),
        "Aplicando sugestão de horário...",
        "Sugestão aplicada com sucesso!"
      );

      if (updatedTask) {
        onTaskUpdated(); // Notifica o componente pai que a tarefa foi atualizada
        onClose(); // Fecha a caixa de sugestões
      } else {
        showError("Falha ao aplicar a sugestão de horário.");
      }
    } catch (err: any) {
      console.error("Erro ao aplicar sugestão:", err);
      showError(err.message || "Erro ao aplicar sugestão.");
    } finally {
      setLoading(false);
    }
  }, [task.id, onClose, onTaskUpdated]);

  return (
    <Card className="w-full max-w-md shadow-lg bg-white/90 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xl font-bold text-teal-800 flex items-center gap-2">
          <Lightbulb className="h-6 w-6" /> Sugestões de Horário
        </CardTitle>
        <Button variant="ghost" onClick={onClose} className="p-2">
          <X className="h-5 w-5" />
        </Button>
      </CardHeader>
      <CardContent className="pt-2 space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-4 text-center text-teal-600">
            <Loader2 className="h-8 w-8 mb-2 animate-spin" />
            <p className="text-lg font-semibold">Gerando sugestões...</p>
            <p className="text-sm text-gray-500">Isso pode levar alguns segundos.</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-4 text-center text-red-600">
            <XCircle className="h-8 w-8 mb-2" />
            <p className="text-lg font-semibold">Erro:</p>
            <p className="text-sm text-gray-700">{error}</p>
            <Button onClick={fetchSuggestions} className="mt-4 bg-teal-600 hover:bg-teal-700">Tentar Novamente</Button>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-4 text-center text-gray-600">
            <Lightbulb className="h-8 w-8 mb-2" />
            <p className="text-lg font-semibold">Nenhuma sugestão encontrada.</p>
            <p className="text-sm text-gray-500">Tente ajustar o prompt nas configurações.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {suggestions.map((sug, index) => (
              <div key={index} className="border rounded-lg p-3 flex flex-col gap-2 bg-teal-50/50">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-800">{sug.titulo}</h3>
                  <Badge className={cn(
                    "text-xs",
                    sug.badge.includes("HOJE") && "bg-green-500",
                    sug.badge.includes("IDEAL") && "bg-blue-500",
                    sug.badge.includes("VIÁVEL") && "bg-purple-500",
                    sug.badge.includes("SUBÓTIMO") && "bg-yellow-500",
                  )}>{sug.badge}</Badge>
                </div>
                <p className="text-sm text-gray-700">{sug.justificativa}</p>
                <div className="flex items-center text-sm text-gray-600">
                  <CalendarDays className="h-4 w-4 mr-1" />
                  <span>{format(parseISO(`${sug.data}T${sug.hora}`), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                </div>
                <Button
                  onClick={() => handleApplySuggestion(sug)}
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-1 text-sm"
                  disabled={loading}
                >
                  <CheckCircle className="h-4 w-4 mr-2" /> Aplicar Sugestão
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AITaskSuggestionBox;