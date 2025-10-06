export interface TodoistTask {
  id: string;
  content: string;
  description?: string;
  due?: {
    date: string;
    string: string;
    lang: string;
    is_recurring: boolean;
  } | null;
  priority: number; // 1 (lowest) to 4 (highest)
  is_completed: boolean;
  project_id: string;
  project_name?: string; // Adicionado para facilitar a exibição
  classificacao?: 'essencial' | 'descartavel'; // Classificação interna do app
  deadline?: string | null; // Adicionado o campo deadline
  parent_id?: string | null; // Adicionado para identificar subtarefas
}

export interface TodoistProject {
  id: string;
  name: string;
  color: string;
}

export interface AISuggestion {
  data: string; // YYYY-MM-DD
  hora: string; // HH:MM (Brasília)
  prioridade_sugestao: number; // 1 (melhor) a 5 (pior)
  badge: "🟢 HOJE" | "⭐ IDEAL" | "✅ VIÁVEL" | "⚠️ SUBÓTIMO";
  titulo: string; // Max 50 chars
  justificativa: string; // 1-2 frases
  janela: "ouro" | "intermediaria" | "declinio" | "pessoal";
  reasoning: string; // Internal reasoning
}

export interface AITaskMetadata {
  tipo_tarefa: "PROFISSIONAL" | "PESSOAL";
  demanda_cognitiva: "ALTA" | "MEDIA" | "BAIXA";
  duracao_estimada_min: number;
  tarefas_p4_ignoradas: number;
}

export interface AISuggestionResponse {
  sugestoes: AISuggestion[];
  metadata: AITaskMetadata;
}