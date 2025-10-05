"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { showSuccess, showError } from '@/utils/toast';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signInWithCustomToken, User as FirebaseUser } from 'firebase/auth';
import { Loader2, Brain } from 'lucide-react';

// Assume these global variables are provided by the environment
// Dyad will inject these variables into the global scope.
declare const __app_id: string;
declare const __firebase_config: any;
declare const __initial_auth_token: string;

const DEFAULT_SYSTEM_PROMPT = `Você é o Tutor IA 'SEISO' e sua função é ajudar o usuário a quebrar tarefas complexas em micro-passos acionáveis. Responda de forma concisa e direta, usando linguagem de coaching, sempre mantendo o foco no próximo passo e na execução imediata. Cada resposta deve ser uma lista numerada de 3 a 5 micro-passos.`;

const AITutorSettings: React.FC = () => {
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [firebaseInitialized, setFirebaseInitialized] = useState(false);

  // Initialize Firebase app if not already initialized
  useEffect(() => {
    if (getApps().length === 0) {
      try {
        initializeApp(__firebase_config);
        console.log("Firebase app initialized.");
      } catch (e) {
        console.error("Error initializing Firebase app:", e);
        showError("Erro ao inicializar Firebase.");
        setLoading(false);
        return;
      }
    }
    setFirebaseInitialized(true);
  }, []);

  // Authenticate user and load prompt
  useEffect(() => {
    if (!firebaseInitialized) return;

    const auth = getAuth();
    const firestore = getFirestore();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        console.log("Firebase user authenticated:", currentUser.uid);
        await loadPrompt(currentUser.uid, firestore);
      } else {
        console.log("No Firebase user, attempting custom token sign-in.");
        try {
          if (__initial_auth_token) {
            const userCredential = await signInWithCustomToken(auth, __initial_auth_token);
            setUser(userCredential.user);
            console.log("Signed in with custom token:", userCredential.user.uid);
            await loadPrompt(userCredential.user.uid, firestore);
          } else {
            console.warn("No __initial_auth_token found for Firebase custom sign-in.");
            showError("Token de autenticação Firebase ausente.");
            setLoading(false);
          }
        } catch (error) {
          console.error("Error signing in with custom token:", error);
          showError("Erro ao autenticar com Firebase.");
          setLoading(false);
        }
      }
    });

    return () => unsubscribe();
  }, [firebaseInitialized]);

  const loadPrompt = useCallback(async (userId: string, firestore: any) => {
    setLoading(true);
    try {
      const promptDocRef = doc(firestore, `artifacts/${__app_id}/users/${userId}/ai_tutor_config/prompt_document`);
      const docSnap = await getDoc(promptDocRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        setCustomPrompt(data?.systemPrompt || DEFAULT_SYSTEM_PROMPT);
        showSuccess("Prompt carregado com sucesso!");
      } else {
        setCustomPrompt(DEFAULT_SYSTEM_PROMPT);
        showSuccess("Nenhum prompt customizado encontrado, usando padrão.");
      }
    } catch (error) {
      console.error("Error loading AI Tutor prompt:", error);
      showError("Erro ao carregar o prompt do Tutor de IA.");
      setCustomPrompt(DEFAULT_SYSTEM_PROMPT); // Fallback to default on error
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSavePrompt = useCallback(async () => {
    if (!user) {
      showError("Usuário não autenticado. Não foi possível salvar o prompt.");
      return;
    }
    setSaving(true);
    try {
      const firestore = getFirestore();
      const promptDocRef = doc(firestore, `artifacts/${__app_id}/users/${user.uid}/ai_tutor_config/prompt_document`);
      await setDoc(promptDocRef, { systemPrompt: customPrompt });
      showSuccess("Prompt salvo com sucesso!");
    } catch (error) {
      console.error("Error saving AI Tutor prompt:", error);
      showError("Erro ao salvar o prompt do Tutor de IA.");
    } finally {
      setSaving(false);
    }
  }, [user, customPrompt]);

  if (!firebaseInitialized) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="mt-2 text-gray-600">Inicializando Firebase...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="mt-2 text-gray-600">Carregando configurações do Tutor de IA...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-purple-100 to-indigo-100 p-4">
      <Card className="w-full max-w-2xl shadow-lg bg-white/80 backdrop-blur-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-purple-800 flex items-center justify-center gap-2">
            <Brain className="h-8 w-8" /> Configurações do Tutor de IA
          </CardTitle>
          <CardDescription className="text-lg text-gray-600 mt-2">
            Personalize as instruções do sistema para o Tutor de IA.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="system-prompt" className="text-lg font-semibold text-gray-700">Instrução de Sistema (System Prompt)</Label>
            <Textarea
              id="system-prompt"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={10}
              className="min-h-[200px] p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder={DEFAULT_SYSTEM_PROMPT}
            />
          </div>
          <Button onClick={handleSavePrompt} disabled={saving || !user} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 rounded-md transition-colors flex items-center justify-center">
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...
              </>
            ) : (
              "Salvar Prompt"
            )}
          </Button>
          {!user && (
            <p className="text-red-500 text-sm text-center">
              Aguardando autenticação do usuário para carregar/salvar configurações.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AITutorSettings;