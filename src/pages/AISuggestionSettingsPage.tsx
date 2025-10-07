"use client";

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save } from "lucide-react";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { showSuccess } from "@/utils/toast";

const AI_SUGGESTION_SYSTEM_PROMPT_KEY = 'ai_suggestion_system_prompt';
const DEFAULT_SUGGESTION_SYSTEM_PROMPT = `Você é um assistente de IA especializado em produtividade e organização de tarefas, com foco em pessoas com TDAH. Sua função é analisar uma nova tarefa e a agenda existente do usuário para sugerir 3 horários ideais para a execução da tarefa.

As sugestões devem ser baseadas em:
1.  **Prioridade da tarefa**: Tarefas P1 (prioridade 4) são urgentes, P2 (prioridade 3) são importantes, P3 (prioridade 2) são médias, P4 (prioridade 1) são baixas.
2.  **Demanda cognitiva da tarefa**: Alta, Média, Baixa.
3.  **Duração estimada**: Em minutos.
4.  **Janelas de produtividade do usuário**:
    *   "Ouro": Períodos de alta energia e foco (manhã cedo).
    *   "Intermediária": Períodos de energia moderada (final da manhã, início da tarde).
    *   "Declínio": Períodos de baixa energia (final da tarde, noite).
    *   "Pessoal": Horários fora do trabalho, para tarefas pessoais.
5.  **Conflitos com a agenda existente**: Evitar sobreposições.

Para cada sugestão, forneça:
-   \`data\`: Data no formato YYYY-MM-DD.
-   \`hora\`: Hora no formato HH:MM (fuso horário de Brasília).
-   \`prioridade_sugestao\`: Um número de 1 (melhor) a 5 (pior) para a qualidade da sugestão.
-   \`badge\`: Uma string curta para a UI (ex: "🟢 HOJE", "⭐ IDEAL", "✅ VIÁVEL", "⚠️ SUBÓTIMO").
-   \`titulo\`: Um título curto para a sugestão (máx. 50 caracteres).
-   \`justificativa\`: 1-2 frases explicando por que essa sugestão é boa.
-   \`janela\`: A janela de produtividade ("ouro", "intermediaria", "declinio", "pessoal").
-   \`reasoning\`: (Interno, para debug) Um breve raciocínio sobre a escolha.

A resposta DEVE ser um objeto JSON, formatado dentro de um bloco de código markdown \`\`\`json\`, com as seguintes chaves:
-   \`sugestoes\`: Um array de objetos \`AISuggestion\`.
-   \`metadata\`: Um objeto \`AITaskMetadata\` contendo:
    -   \`tipo_tarefa\`: "PROFISSIONAL" ou "PESSOAL".
    -   \`demanda_cognitiva\`: "ALTA", "MEDIA" ou "BAIXA".
    -   \`duracao_estimada_min\`: Número estimado de minutos.
    -   \`tarefas_p4_ignoradas\`: Número de tarefas P4 ignoradas na agenda (se aplicável).

Exemplo de JSON de saída:
\`\`\`json
{
  "sugestoes": [
    {
      "data": "2024-08-01",
      "hora": "09:00",
      "prioridade_sugestao": 1,
      "badge": "⭐ IDEAL",
      "titulo": "Manhã de alta energia",
      "justificativa": "Aproveite seu pico de foco para esta tarefa complexa.",
      "janela": "ouro",
      "reasoning": "Alta demanda cognitiva, janela ouro disponível."
    },
    {
      "data": "2024-08-01",
      "hora": "14:30",
      "prioridade_sugestao": 2,
      "badge": "✅ VIÁVEL",
      "titulo": "Pós-almoço, bom para foco",
      "justificativa": "Período intermediário, ideal para tarefas de média complexidade.",
      "janela": "intermediaria",
      "reasoning": "Média demanda cognitiva, janela intermediária disponível."
    }
  ],
  "metadata": {
    "tipo_tarefa": "PROFISSIONAL",
    "demanda_cognitiva": "ALTA",
    "duracao_estimada_min": 60,
    "tarefas_p4_ignoradas": 0
  }
}
\`\`\`
`;

const AISuggestionSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [customPrompt, setCustomPrompt] = useState("");

  useEffect(() => {
    const savedPrompt = localStorage.getItem(AI_SUGGESTION_SYSTEM_PROMPT_KEY);
    setCustomPrompt(savedPrompt || DEFAULT_SUGGESTION_SYSTEM_PROMPT);
  }, []);

  const handleSavePrompt = () => {
    localStorage.setItem(AI_SUGGESTION_SYSTEM_PROMPT_KEY, customPrompt.trim());
    showSuccess("Prompt de Sugestão de IA salvo com sucesso!");
  };

  const handleResetToDefault = () => {
    setCustomPrompt(DEFAULT_SUGGESTION_SYSTEM_PROMPT);
    localStorage.setItem(AI_SUGGESTION_SYSTEM_PROMPT_KEY, DEFAULT_SUGGESTION_SYSTEM_PROMPT);
    showSuccess("Prompt de Sugestão de IA resetado para o padrão!");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-green-100 to-teal-100 p-4">
      <Card className="w-full max-w-2xl shadow-lg bg-white/80 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" onClick={() => navigate("/main-menu")} className="text-teal-800 hover:bg-teal-200">
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
            </Button>
            <CardTitle className="text-3xl font-bold text-teal-800 flex-grow">
              Configurações de Sugestão de IA
            </CardTitle>
            <div className="w-20"></div> {/* Espaçador */}
          </div>
          <CardDescription className="text-lg text-gray-600 mt-2">
            Personalize o prompt do sistema para a IA que sugere horários de tarefas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="system-prompt" className="text-lg font-semibold">Prompt do Sistema de Sugestão de IA</Label>
            <Textarea
              id="system-prompt"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={15}
              className="min-h-[300px]"
              placeholder="Insira o prompt do sistema para a IA de sugestão de tarefas aqui..."
            />
            <p className="text-sm text-gray-500">
              Este prompt define como a IA gera sugestões de horários para suas tarefas.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between gap-4">
          <Button
            onClick={handleResetToDefault}
            variant="outline"
            className="flex-1 border-teal-600 text-teal-600 hover:bg-teal-50"
          >
            Resetar para Padrão
          </Button>
          <Button
            onClick={handleSavePrompt}
            className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-semibold"
          >
            <Save className="mr-2 h-4 w-4" /> Salvar Prompt
          </Button>
        </CardFooter>
      </Card>
      <MadeWithDyad />
    </div>
  );
};

export default AISuggestionSettingsPage;