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
  deadline?: {
    date: string; // Formato YYYY-MM-DD
  } | null;
  parent_id?: string | null; // Adicionado para identificar subtarefas
  labels?: string[]; // Adicionado para armazenar as labels brutas
  duration?: { // Campo duration nativo do Todoist
    amount: number;
    unit: 'minute' | 'day';
  } | null;
  contextType?: 'pessoal' | 'profissional' | 'indefinido'; // Novo: Classificação de contexto da IA
}

export interface TodoistProject {
  id: string;
  name: string;
  color: string;
}

export interface SequencerSettings {
  dailyContexts: {
    [key: string]: { // 'monday', 'tuesday', etc.
      professional: { start: string; end: string }[]; // e.g., [{ start: '09:00', end: '12:00' }]
      personal: { start: string; end: string }[];
    };
  };
}