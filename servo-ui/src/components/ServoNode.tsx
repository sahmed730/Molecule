import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { Cpu, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export type ServoNodeData = {
  label: string;
  coreTask?: string;
  purpose?: string;
  status: 'ready' | 'generating' | 'error';
  language: string;
  icon?: string;
  dataShape?: string;
  expectedOutput?: string;
  dependencies?: string;
  errorHandling?: string;
  testingRequirements?: string;
};

/** Calculates a 0–100 completeness score based on QUALITY of filled fields, not just presence */
const getCompleteness = (data: ServoNodeData): number => {
  let score = 0;
  const maxScore = 6;
  
  // coreTask must be descriptive (at least 20 chars)
  if (data.coreTask && data.coreTask.trim().length > 20) score += 1;
  
  // dataShape must mention types (e.g., dict, string, int)
  if (data.dataShape && /dict|string|int|array|object|list/i.test(data.dataShape)) score += 1;
  
  // expectedOutput must mention types
  if (data.expectedOutput && /dict|string|int|array|object|list|boolean/i.test(data.expectedOutput)) score += 1;
  
  // dependencies only count if the core task is actually defined (prevent gaming the score)
  if (data.dependencies && data.dependencies.trim().length > 2 && score >= 1) score += 1;
  
  // errorHandling must mention specific errors (Error, Exception, ValueError, etc)
  if (data.errorHandling && /error|exception|fail|timeout|invalid/i.test(data.errorHandling)) score += 1;
  
  // testingRequirements should have multiple scenarios (look for commas, "and", or newlines)
  if (data.testingRequirements && (data.testingRequirements.includes(',') || data.testingRequirements.includes(' and ') || data.testingRequirements.includes('\n'))) score += 1;

  return Math.round((score / maxScore) * 100);
};

/** SVG arc ring showing completeness */
const CompletenessRing = ({ pct }: { pct: number }) => {
  const r = 10;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 80 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" className="shrink-0">
      <circle cx="14" cy="14" r={r} fill="none" stroke="#e2e8f0" strokeWidth="3" />
      <circle
        cx="14" cy="14" r={r} fill="none"
        stroke={color} strokeWidth="3"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 14 14)"
        style={{ transition: 'stroke-dasharray 0.4s ease' }}
      />
      <text x="14" y="18" textAnchor="middle" fontSize="7" fontWeight="bold" fill={color}>
        {pct}
      </text>
    </svg>
  );
};

const ServoNode = ({ data }: NodeProps<ServoNodeData>) => {
  const completeness = getCompleteness(data);

  const getStatusIcon = () => {
    switch (data.status) {
      case 'ready': return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
      case 'generating': return <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />;
      case 'error': return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
      default: return null;
    }
  };

  const borderColor =
    completeness >= 80 ? 'border-green-400' :
    completeness >= 40 ? 'border-amber-400' :
    'border-slate-700';

  return (
    <div className={`px-4 py-2 shadow-xl rounded-lg bg-white border-2 ${borderColor} min-w-[210px] transition-colors`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-slate-700 border-2 border-white" />

      <div className="flex flex-col">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1 bg-slate-100 rounded shrink-0">
              <Cpu className="w-3.5 h-3.5 text-slate-700" />
            </div>
            <span className="font-bold text-xs text-slate-800 uppercase tracking-tight truncate">
              {data.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 ml-2 shrink-0">
            {getStatusIcon()}
            <CompletenessRing pct={completeness} />
          </div>
        </div>

        <div className="py-2 space-y-1">
          <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Core Task</div>
          <div className="text-xs text-slate-600 leading-tight line-clamp-2 italic">
            &ldquo;{data.coreTask || data.purpose || 'Not specified'}&rdquo;
          </div>
        </div>

        <div className="flex items-center justify-between mt-1 pt-2 border-t border-slate-50">
          <div className="flex items-center gap-1">
            {data.language && (
              <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-mono">
                {data.language}
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-400 font-medium">MODULE</div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-slate-700 border-2 border-white" />
    </div>
  );
};

export default memo(ServoNode);
