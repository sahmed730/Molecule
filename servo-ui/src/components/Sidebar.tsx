import React, { useState } from 'react';
import { Plus, ChevronLeft, ChevronRight, Library } from 'lucide-react';

const Sidebar = () => {
  const [isExpanded, setIsExpanded] = useState(true);

  const onDragStart = (event: React.DragEvent, nodeType: string, data: any) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify({ type: nodeType, data }));
    event.dataTransfer.effectAllowed = 'move';
  };

  const defaultModuleData = {
    label: 'New Module',
    coreTask: 'What problem does this solve?',
    dataShape: 'What does the incoming data look like?',
    expectedOutput: 'What should this return?',
    rules: '',
    status: 'ready',
    language: '',
    platform: '',
    dependencies: '',
    errorHandling: '',
    testingRequirements: ''
  };

  return (
    <aside className={`relative border-r border-slate-200/50 dark:border-slate-800/50 bg-white/40 dark:bg-[#060913]/40 backdrop-blur-xl transition-all duration-300 ease-in-out flex flex-col shadow-lg shadow-indigo-500/5 ${isExpanded ? 'w-64 p-5' : 'w-16 p-2 items-center'}`}>
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="absolute -right-3 top-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full p-1.5 shadow-md hover:scale-110 z-50 transition-all duration-300 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
        title={isExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
      >
        {isExpanded ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {isExpanded ? (
        <div className="flex flex-col h-full opacity-100 transition-opacity duration-300">
          <div className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-6">
            Module Library
          </div>

          <div className="space-y-4">
            <div
              className="group p-5 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md border border-indigo-200 dark:border-indigo-500/30 rounded-xl shadow-sm cursor-grab active:cursor-grabbing hover:bg-indigo-50/80 dark:hover:bg-slate-700/80 hover:shadow-lg hover:shadow-indigo-500/10 transition-all duration-300 flex flex-col items-center justify-center text-center"
              onDragStart={(event) => onDragStart(event, 'servo', defaultModuleData)}
              draggable
            >
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-100 to-blue-50 dark:from-indigo-900/40 dark:to-blue-900/20 rounded-full flex items-center justify-center mb-3 shadow-inner group-hover:scale-110 transition-transform duration-300 border border-indigo-200/50 dark:border-indigo-700/50">
                <Plus className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Drag New Module</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 leading-tight">Place on canvas to customize</div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-200/50 dark:border-slate-800/50">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed italic bg-slate-100/50 dark:bg-slate-800/30 p-3 rounded-lg border border-slate-200/50 dark:border-slate-700/50">
              Drag the "New Module" block onto the board to start manually assembling your application.
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center mt-10 space-y-8 opacity-100 transition-opacity duration-300">
          <div title="Module Library" className="text-slate-400 dark:text-slate-500">
            <Library className="w-5 h-5" />
          </div>
          <div
            className="w-12 h-12 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md border border-indigo-200 dark:border-indigo-500/30 rounded-xl shadow-sm cursor-grab active:cursor-grabbing hover:bg-indigo-50/80 dark:hover:bg-slate-700/80 hover:shadow-lg hover:shadow-indigo-500/10 flex items-center justify-center hover:scale-105 transition-all duration-300"
            title="Drag New Module"
            onDragStart={(event) => onDragStart(event, 'servo', defaultModuleData)}
            draggable
          >
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-100 to-blue-50 dark:from-indigo-900/40 dark:to-blue-900/20 rounded-full flex items-center justify-center shadow-inner border border-indigo-200/50 dark:border-indigo-700/50">
              <Plus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
