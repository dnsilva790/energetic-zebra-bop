"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Icon as LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface FiveSButtonProps {
  icon: LucideIcon;
  title: string;
  description: string;
  colorClass: string;
  onClick: () => void;
}

const FiveSButton: React.FC<FiveSButtonProps> = ({
  icon: Icon,
  title,
  description,
  colorClass,
  onClick,
}) => {
  return (
    <Button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center p-6 h-auto text-white rounded-lg shadow-md transition-all duration-200 ease-in-out transform hover:scale-105",
        colorClass
      )}
    >
      <Icon size={48} className="mb-3" />
      <h3 className="text-xl font-bold mb-1">{title}</h3>
      <p className="text-sm text-center opacity-90">{description}</p>
    </Button>
  );
};

export default FiveSButton;