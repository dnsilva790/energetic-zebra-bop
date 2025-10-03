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
}

export interface TodoistProject {
  id: string;
  name: string;
  color: string;
}