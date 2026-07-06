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
    <aside className={`relative border-r border-default bg-neutral-primary-soft/80 backdrop-blur-xl transition-all duration-300 ease-in-out flex flex-col shadow-lg shadow-black/20 ${isExpanded ? 'w-64 p-5' : 'w-16 p-2 items-center'}`}>
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="absolute -right-3 top-6 bg-neutral-primary-strong border border-default rounded-full p-1.5 shadow-md hover:scale-110 z-50 transition-all duration-300 text-body-subtle hover:text-heading hover:bg-neutral-secondary-medium"
        title={isExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
      >
        {isExpanded ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {isExpanded ? (
        <div className="flex flex-col h-full opacity-100 transition-opacity duration-300">
          <div className="text-xs font-black text-body-subtle uppercase tracking-widest mb-6">
            Module Library
          </div>

          <div className="space-y-4">
            <div
              className="group p-5 bg-neutral-primary border border-default rounded-[12px] shadow-xs cursor-grab active:cursor-grabbing hover:bg-neutral-secondary-medium transition-all duration-300 flex flex-col items-center justify-center text-center"
              onDragStart={(event) => onDragStart(event, 'servo', defaultModuleData)}
              draggable
            >
              <div className="w-12 h-12 bg-neutral-primary-strong rounded-full flex items-center justify-center mb-3 shadow-inner group-hover:scale-110 transition-transform duration-300 border border-default-medium">
                <Plus className="w-6 h-6 text-fg-brand" />
              </div>
              <div className="text-sm font-medium text-heading">Drag New Module</div>
              <div className="text-[10px] text-body-subtle mt-1.5 leading-tight">Place on canvas to customize</div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-default-subtle">
            <div className="text-[11px] text-body-subtle leading-relaxed italic bg-neutral-primary p-3 rounded-[12px] border border-default-subtle">
              Drag the "New Module" block onto the board to start manually assembling your application.
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center mt-10 space-y-8 opacity-100 transition-opacity duration-300">
          <div title="Module Library" className="text-body-subtle">
            <Library className="w-5 h-5" />
          </div>
          <div
            className="w-12 h-12 bg-neutral-primary border border-default rounded-[12px] shadow-xs cursor-grab active:cursor-grabbing hover:bg-neutral-secondary-medium flex items-center justify-center hover:scale-105 transition-all duration-300"
            title="Drag New Module"
            onDragStart={(event) => onDragStart(event, 'servo', defaultModuleData)}
            draggable
          >
            <div className="w-8 h-8 bg-neutral-primary-strong rounded-full flex items-center justify-center shadow-inner border border-default-medium">
              <Plus className="w-4 h-4 text-fg-brand" />
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
