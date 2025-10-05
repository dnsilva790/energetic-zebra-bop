import React, { useState, useEffect, useCallback } from 'react';
// Importações de Firebase necessárias
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

// Definição do Prompt Padrão (System Instruction)
const DEFAULT_SYSTEM_PROMPT = `Você é o Tutor IA 'SEISO' e sua função é ajudar o usuário a quebrar tarefas complexas em micro-passos acionáveis. Responda de forma concisa e direta, usando linguagem de coaching, sempre mantendo o foco no próximo passo e na execução imediata. Cada resposta deve ser uma lista numerada de 3 a 5 micro-passos.`;

const AITutorSettings = () => {
    // Variáveis de Estado para Firebase e Dados
    const [promptText, setPromptText] = useState(DEFAULT_SYSTEM_PROMPT);
    const [loading, setLoading] = useState(true);
    const [isFirebaseReady, setIsFirebaseReady] = useState(false);
    
    // Instâncias do Firebase (Armazenadas no estado para serem acessíveis a outras funções)
    const [db, setDb] = useState<any>(null);
    const [auth, setAuth] = useState<any>(null);
    const [userId, setUserId] = useState<string | null>(null);

    // --- Configuração e Autenticação do Firebase ---
    useEffect(() => {
        // Assegura que o script não falhe se as variáveis não existirem (embora sejam esperadas)
        if (typeof __firebase_config === 'undefined' || typeof __app_id === 'undefined') {
            console.error("Variáveis de configuração Firebase não encontradas.");
            return;
        }

        const setupFirebase = async () => {
            try {
                const firebaseConfig = JSON.parse(__firebase_config);
                const app = initializeApp(firebaseConfig);
                const firestoreDb = getFirestore(app);
                const firebaseAuth = getAuth(app);
                
                setDb(firestoreDb);
                setAuth(firebaseAuth);

                // 1. Autenticação: Assíncrona e Obrigatória
                if (typeof __initial_auth_token !== 'undefined') {
                    await signInWithCustomToken(firebaseAuth, __initial_auth_token);
                } else {
                    // Fallback para login anônimo se o token não estiver disponível
                    await signInAnonymously(firebaseAuth);
                }
                
                // 2. Definir o userId após a autenticação bem-sucedida
                const currentUserId = firebaseAuth.currentUser?.uid || crypto.randomUUID();
                setUserId(currentUserId);
                
                // 3. Sinalizar que o Firebase está pronto para operações de dados
                setIsFirebaseReady(true);

            } catch (error) {
                console.error("Erro ao inicializar e autenticar o Firebase:", error);
                setLoading(false); // Parar de carregar se falhar
            }
        };

        setupFirebase();
    }, []); // Executa apenas na montagem

    // --- Lógica de Carregamento do Prompt (Dependente do Firebase estar Pronto) ---
    useEffect(() => {
        if (!isFirebaseReady || !db || !userId) return;

        const loadPrompt = async () => {
            setLoading(true);
            try {
                const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
                const promptDocRef = doc(db, 
                    `artifacts/${appId}/users/${userId}/ai_tutor_config`, 
                    'prompt_document'
                );
                
                const docSnap = await getDoc(promptDocRef);
                
                if (docSnap.exists() && docSnap.data().systemPrompt) {
                    setPromptText(docSnap.data().systemPrompt);
                } else {
                    // Se não houver documento, salva o prompt padrão para uso futuro
                    await setDoc(promptDocRef, { systemPrompt: DEFAULT_SYSTEM_PROMPT });
                    setPromptText(DEFAULT_SYSTEM_PROMPT);
                }

            } catch (error) {
                console.error("Erro ao carregar prompt do Firestore:", error);
            } finally {
                setLoading(false);
            }
        };

        loadPrompt();
    }, [isFirebaseReady, db, userId]); // Depende do estado de prontidão e das instâncias

    // --- Lógica de Salvamento ---
    const handleSavePrompt = useCallback(async () => {
        if (!db || !userId || loading) return;

        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const promptDocRef = doc(db, 
                `artifacts/${appId}/users/${userId}/ai_tutor_config`, 
                'prompt_document'
            );
            
            await setDoc(promptDocRef, { systemPrompt: promptText });
            alert("Instrução de Sistema salva com sucesso!"); // Usando alert() em um contexto de desenvolvimento
        } catch (error) {
            console.error("Erro ao salvar prompt no Firestore:", error);
            alert("Erro ao salvar a instrução. Tente novamente.");
        }
    }, [db, userId, promptText, loading]);

    // --- Renderização ---

    if (loading || !isFirebaseReady) {
        return (
            <div className="flex flex-col items-center justify-center p-8 h-full bg-white rounded-xl shadow-lg">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                <p className="mt-4 text-indigo-600 font-medium">Inicializando Firebase...</p>
            </div>
        );
    }

    return (
        <div className="p-6 md:p-8 bg-white rounded-xl shadow-2xl max-w-3xl mx-auto font-sans">
            <h1 className="text-3xl font-extrabold text-gray-800 mb-2">
                ⚙️ Configurações do Tutor IA
            </h1>
            <p className="text-sm text-gray-500 mb-6 border-b pb-4">
                Personalize o comportamento e a personalidade do seu Tutor SEISO.
                <br/>
                O ID do Usuário para este dispositivo é: <span className="font-mono text-xs text-indigo-500 bg-indigo-50 p-1 rounded-md">{userId}</span>
            </p>

            <div className="mb-6">
                <label htmlFor="system-prompt" className="block text-lg font-semibold text-gray-700 mb-2">
                    Instrução de Sistema (System Prompt)
                </label>
                <textarea
                    id="system-prompt"
                    rows={10}
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-gray-700 text-sm resize-none transition duration-150"
                    placeholder="Defina a persona e as regras de resposta para o seu Tutor IA."
                ></textarea>
                <p className="mt-2 text-xs text-gray-500">
                    Exemplo: "Sua resposta deve ser uma lista numerada e usar termos de jardinagem."
                </p>
            </div>

            <div className="flex justify-end">
                <button
                    onClick={handleSavePrompt}
                    className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg shadow-md hover:bg-indigo-700 transition duration-200 focus:outline-none focus:ring-4 focus:ring-indigo-500 focus:ring-opacity-50 disabled:opacity-50"
                    disabled={loading}
                >
                    {loading ? 'Salvando...' : 'Salvar Instrução'}
                </button>
            </div>
        </div>
    );
};

export default AITutorSettings;