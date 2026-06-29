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
    <aside className={`relative border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 transition-all duration-300 ease-in-out flex flex-col ${isExpanded ? 'w-64 p-4' : 'w-16 p-2 items-center'}`}>
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="absolute -right-3 top-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full p-1 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 z-50 transition-transform"
        title={isExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
      >
        {isExpanded ? <ChevronLeft className="w-4 h-4 text-slate-500 dark:text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-500 dark:text-slate-400" />}
      </button>

      {isExpanded ? (
        <div className="flex flex-col h-full opacity-100 transition-opacity duration-300">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
            Module Library
          </div>

          <div className="space-y-3">
            <div
              className="p-4 bg-white dark:bg-slate-800 border-2 border-dashed border-blue-400 dark:border-blue-500/50 rounded-lg shadow-sm cursor-grab active:cursor-grabbing hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors flex flex-col items-center justify-center text-center"
              onDragStart={(event) => onDragStart(event, 'servo', defaultModuleData)}
              draggable
            >
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-2">
                <Plus className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Drag New Module</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Place on canvas to customize</div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
            <div className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed italic">
              Drag the "New Module" block onto the board to start manually assembling your application.
              You can then click it to edit its Name, Inputs, and Outputs.
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center mt-10 space-y-6 opacity-100 transition-opacity duration-300">
          <div title="Module Library" className="text-slate-400 dark:text-slate-500">
            <Library className="w-5 h-5" />
          </div>
          <div
            className="w-10 h-10 bg-white dark:bg-slate-800 border-2 border-dashed border-blue-400 dark:border-blue-500/50 rounded-lg shadow-sm cursor-grab active:cursor-grabbing hover:bg-blue-50 dark:hover:bg-slate-700 flex items-center justify-center"
            title="Drag New Module"
            onDragStart={(event) => onDragStart(event, 'servo', defaultModuleData)}
            draggable
          >
            <Plus className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
