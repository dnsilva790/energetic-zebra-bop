"use client";

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { showError } from "@/utils/toast";
import { MadeWithDyad } from "@/components/made-with-dyad";

const SetupPage = () => {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSaveToken = () => {
    if (!token.trim()) {
      setError("Por favor, cole seu token");
      showError("Por favor, cole seu token");
      return;
    }
    localStorage.setItem("todoist_token", token.trim());
    navigate("/main-menu");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-100 to-purple-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-gray-800">
            Bem-vindo ao App 5S + TDAH
          </CardTitle>
          <CardDescription className="text-lg text-gray-600 mt-2">
            Configure sua conexão com o Todoist
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-gray-700">
            Para começar, precisamos do seu token de API do Todoist.
          </p>
          <a
            href="https://todoist.com/help/articles/find-your-api-token-Jpzx9IIlB"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline block text-sm"
          >
            Como obter meu token?
          </a>

          <div className="space-y-2">
            <Label htmlFor="todoist-token">Todoist API Token</Label>
            <Input
              id="todoist-token"
              type="password"
              placeholder="Cole seu token aqui"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                if (error) setError("");
              }}
              className={error ? "border-red-500" : ""}
            />
            {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
          </div>

          <Button
            onClick={handleSaveToken}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-md transition-colors"
          >
            Salvar e Continuar
          </Button>
        </CardContent>
      </Card>
      <MadeWithDyad />
    </div>
  );
};

export default SetupPage;