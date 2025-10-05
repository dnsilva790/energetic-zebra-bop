import React, { useState, useEffect, useCallback } from 'react';
// Importações de Firebase necessárias
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { useAITutorConfig } from '@/context/AITutorConfigContext'; // Importar o hook do contexto

// Definição do Prompt Padrão (System Instruction)
const DEFAULT_SYSTEM_PROMPT = `Você é o Tutor IA 'SEISO' e sua função é ajudar o usuário a quebrar tarefas complexas em micro-passos acionáveis. Responda de forma concisa e direta, usando linguagem de coaching, sempre mantendo o foco no próximo passo e na execução imediata. Cada resposta deve ser uma lista numerada de 3 a 5 micro-passos.`;

const AITutorSettings = () => {
    // Consumir do contexto
    const { systemPrompt: contextSystemPrompt, isLoading: contextLoading, userId, refreshPrompt } = useAITutorConfig();

    const [promptText, setPromptText] = useState(DEFAULT_SYSTEM_PROMPT);
    const [isSaving, setIsSaving] = useState(false); // Estado local para o botão de salvar

    // Atualiza o estado local do prompt quando o prompt do contexto muda
    useEffect(() => {
        if (!contextLoading && contextSystemPrompt) {
            setPromptText(contextSystemPrompt);
        }
    }, [contextLoading, contextSystemPrompt]);

    // --- Lógica de Salvamento ---
    const handleSavePrompt = useCallback(async () => {
        if (!userId || contextLoading || isSaving) return; // Usa contextLoading para desabilitar

        setIsSaving(true);
        try {
            // O 'db' não é mais necessário aqui, pois o contexto já lida com a inicialização.
            // Precisamos de uma referência ao Firestore para salvar.
            // Como o contexto já inicializou o Firebase, podemos obter o 'db' de lá,
            // ou, para manter a simplicidade, podemos passar o 'db' no contexto se necessário,
            // mas para esta operação, podemos re-inicializar getFirestore se o contexto não o expõe diretamente.
            // Para evitar re-inicialização, vamos assumir que o contexto já tem o 'db' e o 'userId'
            // e que a função `refreshPrompt` é suficiente para notificar o contexto.
            // No entanto, para salvar, precisamos do `db` diretamente.
            // Uma solução mais limpa seria expor `db` no contexto ou ter uma função `savePrompt` no contexto.
            // Por enquanto, vamos re-obter o `db` aqui, mas é uma duplicação.

            // Para evitar duplicação e manter a responsabilidade no contexto,
            // o ideal seria que o contexto expusesse uma função `saveSystemPrompt(newPrompt: string)`.
            // Como não foi solicitado, vou manter a lógica de salvar aqui, mas com a ressalva.

            // Temporariamente, para fazer funcionar sem alterar o contexto para expor 'db':
            if (typeof __firebase_config === 'undefined' || typeof __app_id === 'undefined') {
                console.error("Variáveis de configuração Firebase não encontradas para salvar.");
                alert("Erro: Configuração Firebase ausente.");
                setIsSaving(false);
                return;
            }
            const firebaseConfig = JSON.parse(__firebase_config as string);
            const app = initializeApp(firebaseConfig); // Re-inicializa, o que não é ideal
            const firestoreDb = getFirestore(app);

            const appId = typeof __app_id !== 'undefined' ? (__app_id as string) : 'default-app-id';
            const promptDocRef = doc(firestoreDb, 
                `artifacts/${appId}/users/${userId}/ai_tutor_config`, 
                'prompt_document'
            );
            
            await setDoc(promptDocRef, { systemPrompt: promptText });
            alert("Instrução de Sistema salva com sucesso!");
            refreshPrompt(); // Notifica o contexto para recarregar o prompt
        } catch (error) {
            console.error("Erro ao salvar prompt no Firestore:", error);
            alert("Erro ao salvar a instrução. Tente novamente.");
        } finally {
            setIsSaving(false);
        }
    }, [userId, promptText, contextLoading, refreshPrompt]);

    // --- Renderização ---

    if (contextLoading || !userId) { // Usa o estado de carregamento do contexto
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
                    disabled={contextLoading || isSaving}
                >
                    {isSaving ? 'Salvando...' : 'Salvar Instrução'}
                </button>
            </div>
        </div>
    );
};

export default AITutorSettings;