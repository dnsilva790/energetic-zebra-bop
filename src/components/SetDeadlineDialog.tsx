"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarDays, XCircle } from "lucide-react";
import { format, parseISO, setHours, setMinutes, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface SetDeadlineDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentDeadline: string | null | undefined;
  onSave: (newDeadline: string | null) => void;
  loading: boolean;
}

const SetDeadlineDialog: React.FC<SetDeadlineDialogProps> = ({
  isOpen,
  onClose,
  currentDeadline,
  onSave,
  loading,
}) => {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      if (currentDeadline) {
        const parsedDate = parseISO(currentDeadline);
        if (isValid(parsedDate)) {
          setSelectedDate(parsedDate);
          // Check if the deadline string contains a time component
          const timeMatch = currentDeadline.match(/T(\d{2}:\d{2})/);
          setSelectedTime(timeMatch ? timeMatch[1] : "");
        } else {
          setSelectedDate(undefined);
          setSelectedTime("");
        }
      } else {
        setSelectedDate(undefined);
        setSelectedTime("");
      }
    }
  }, [isOpen, currentDeadline]);

  const handleSave = useCallback(() => {
    if (!selectedDate) {
      onSave(null); // Remove deadline if no date is selected
      return;
    }

    let newDeadlineString = format(selectedDate, "yyyy-MM-dd");
    if (selectedTime) {
      const [hours, minutes] = selectedTime.split(':').map(Number);
      if (!isNaN(hours) && !isNaN(minutes)) {
        let dateWithTime = setHours(selectedDate, hours);
        dateWithTime = setMinutes(dateWithTime, minutes);
        newDeadlineString = format(dateWithTime, "yyyy-MM-dd'T'HH:mm:ss");
      }
    }
    onSave(newDeadlineString);
  }, [selectedDate, selectedTime, onSave]);

  const handleRemoveDeadline = useCallback(() => {
    onSave(null);
  }, [onSave]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Definir Data Limite</DialogTitle>
          <DialogDescription>
            Selecione uma data e, opcionalmente, um horário para o prazo final da tarefa.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="date" className="text-right">
              Data
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-[240px] justify-start text-left font-normal col-span-3",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  initialFocus
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="time" className="text-right">
              Horário (HH:MM)
            </Label>
            <Input
              id="time"
              type="time"
              value={selectedTime}
              onChange={(e) => setSelectedTime(e.target.value)}
              className="col-span-3"
            />
          </div>
        </div>
        <DialogFooter className="flex flex-col sm:flex-row sm:justify-between sm:space-x-2">
          <div className="flex justify-start w-full sm:w-auto mb-2 sm:mb-0">
            {currentDeadline && (
              <Button
                variant="destructive"
                onClick={handleRemoveDeadline}
                disabled={loading}
                className="flex items-center"
              >
                <XCircle className="mr-2 h-4 w-4" /> Remover Data Limite
              </Button>
            )}
          </div>
          <div className="flex justify-end w-full sm:w-auto space-x-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={loading}>Cancelar</Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={loading}>
              Salvar Data Limite
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SetDeadlineDialog;