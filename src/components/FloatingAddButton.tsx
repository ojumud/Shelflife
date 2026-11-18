import React from 'react';
import { Plus } from 'lucide-react';

interface FloatingAddButtonProps {
  onClick: () => void;
}

export const FloatingAddButton: React.FC<FloatingAddButtonProps> = ({ onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Add new item"
      title="Add item (N)"
      className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 z-40 h-14 w-14 rounded-full bg-zinc-900 text-white shadow-[0_10px_28px_rgba(24,24,27,0.28)] hover:bg-zinc-800 active:scale-95 transition-all duration-150 flex items-center justify-center focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zinc-900/25 cursor-pointer"
    >
      <Plus className="w-6 h-6" strokeWidth={2.5} />
    </button>
  );
};
