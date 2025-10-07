"use client";

import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, CalendarDays } from 'lucide-react';

const DateTimeDisplay: React.FC = () => {
  const [currentDateTime, setCurrentDateTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000); // Atualiza a cada segundo

    return () => clearInterval(timer);
  }, []);

  const formattedDate = format(currentDateTime, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const formattedTime = format(currentDateTime, "HH:mm:ss", { locale: ptBR });

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-white/70 backdrop-blur-sm rounded-lg shadow-md text-gray-800">
      <div className="flex items-center gap-2 text-xl font-semibold mb-1">
        <CalendarDays className="h-5 w-5 text-blue-600" />
        <span>{formattedDate}</span>
      </div>
      <div className="flex items-center gap-2 text-2xl font-bold">
        <Clock className="h-6 w-6 text-blue-600" />
        <span>{formattedTime}</span>
      </div>
    </div>
  );
};

export default DateTimeDisplay;