import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

// O Prompt Padrão deve ser idêntico ao usado em AITutorSettings
const DEFAULT_SYSTEM_PROMPT = `Você é o Tutor IA 'SEISO' e sua função é ajudar o usuário a quebrar tarefas complexas em micro-passos acionáveis. Responda de forma concisa e direta, usando linguagem de coaching, sempre mantendo o foco no próximo passo e na execução imediata. Cada resposta deve ser uma lista numerada de 3 a 5 micro-passos.`;

interface AITutorConfig {
  systemPrompt: string;
  isLoading: boolean;
  userId: string | null;
  refreshPrompt: () => void; 
}

const AITutorConfigContext = createContext<AITutorConfig | undefined>(undefined);

export const useAITutorConfig = () => {
  const context = useContext(AITutorConfigContext);
  if (context === undefined) {
    throw new Error('useAITutorConfig deve ser usado dentro de um AITutorConfigProvider');
  }
  return context;
};

interface AITutorConfigProviderProps {
  children: ReactNode;
}

export const AITutorConfigProvider: React.FC<AITutorConfigProviderProps> = ({ children }) => {
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [isLoading, setIsLoading] = useState(true);
  const [isFirebaseReady, setIsFirebaseReady] = useState(false);
  const [db, setDb] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [refreshToggle, setRefreshToggle] = useState(0);

  const refreshPrompt = useCallback(() => {
    setRefreshToggle(prev => prev + 1);
  }, []);

  // --- 1. Inicialização e Autenticação do Firebase (Similar a AITutorSettings) ---
  useEffect(() => {
    if (typeof __firebase_config === 'undefined' || typeof __app_id === 'undefined') {
        console.error("Variáveis de configuração Firebase não encontradas.");
        setIsLoading(false);
        return;
    }

    const setupFirebase = async () => {
        try {
            const firebaseConfig = JSON.parse(__firebase_config as string);
            const app = initializeApp(firebaseConfig);
            const firestoreDb = getFirestore(app);
            const firebaseAuth = getAuth(app);
            
            // 1. Autenticação
            if (typeof __initial_auth_token !== 'undefined') {
                await signInWithCustomToken(firebaseAuth, __initial_auth_token as string);
            } else {
                await signInAnonymously(firebaseAuth);
            }
            
            // 2. Definir o userId
            const currentUserId = firebaseAuth.currentUser?.uid || crypto.randomUUID();
            setUserId(currentUserId);
            
            setDb(firestoreDb);
            setIsFirebaseReady(true);

        } catch (error) {
            console.error("Erro ao inicializar e autenticar o Firebase no Contexto:", error);
            setIsLoading(false);
        }
    };

    setupFirebase();
  }, []);

  // --- 2. Lógica de Carregamento do Prompt (Dependente do Firebase e do refreshToggle) ---
  useEffect(() => {
    if (!isFirebaseReady || !db || !userId) return;

    const loadPrompt = async () => {
        setIsLoading(true);
        try {
            const appId = typeof __app_id !== 'undefined' ? (__app_id as string) : 'default-app-id';
            const promptDocRef = doc(db, 
                `artifacts/${appId}/users/${userId}/ai_tutor_config`, 
                'prompt_document'
            );
            
            const docSnap = await getDoc(promptDocRef);
            
            if (docSnap.exists() && docSnap.data().systemPrompt) {
                setSystemPrompt(docSnap.data().systemPrompt);
            } else {
                // Se não houver, garante que o padrão está definido no Firestore
                await setDoc(promptDocRef, { systemPrompt: DEFAULT_SYSTEM_PROMPT });
                setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
            }

        } catch (error) {
            console.error("Erro ao carregar prompt do Firestore:", error);
        } finally {
            setIsLoading(false);
        }
    };

    loadPrompt();
  }, [isFirebaseReady, db, userId, refreshToggle]); // Recarrega sempre que o refreshToggle mudar

  const value = { systemPrompt, isLoading, userId, refreshPrompt };

  return (
    <AITutorConfigContext.Provider value={value}>
      {children}
    </AITutorConfigContext.Provider>
  );
};