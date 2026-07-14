import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { Cpu, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export type ServoNodeData = {
  label: string;
  status: 'ready' | 'generating' | 'error';
  type?: string;
  responsibilities?: string;
  interfaces?: string;
  communicationContracts?: string;
  technologyStack?: string;
  dependencies?: string;
  constraints?: string;
  nonFunctional?: string;
  testing?: string;
  deployment?: string;
  architectureDecisions?: string;
};

/** Calculates a 0–100 completeness score based on QUALITY of filled fields, not just presence */
const getCompleteness = (data: ServoNodeData): number => {
  let score = 0;
  const maxScore = 6;
  
  if (data.responsibilities && data.responsibilities.trim().length > 15) score += 1;
  if (data.interfaces && data.interfaces.trim().length > 3) score += 1;
  if (data.communicationContracts && data.communicationContracts.trim().length > 5) score += 1;
  if (data.technologyStack && data.technologyStack.trim().length > 3) score += 1;
  if (data.architectureDecisions && data.architectureDecisions.trim().length > 10) score += 1;
  if (data.testing && data.testing.trim().length > 3) score += 1;

  return Math.round((score / maxScore) * 100);
};

/** SVG arc ring showing completeness */
const CompletenessRing = ({ pct }: { pct: number }) => {
  const r = 10;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 80 ? '#00CC88' : pct >= 40 ? '#FF8833' : '#FF3355';
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" className="shrink-0">
      <circle cx="14" cy="14" r={r} fill="none" stroke="#252525" strokeWidth="3" />
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
      case 'ready': return <CheckCircle2 className="w-3.5 h-3.5 text-success" />;
      case 'generating': return <Loader2 className="w-3.5 h-3.5 text-brand animate-spin" />;
      case 'error': return <AlertCircle className="w-3.5 h-3.5 text-danger" />;
      default: return null;
    }
  };

  const borderColor =
    completeness >= 80 ? 'border-success ring-1 ring-success' :
    completeness >= 40 ? 'border-warning ring-1 ring-warning' :
    'border-default';

  return (
    <div className={`px-4 py-2 shadow-xl rounded-[12px] bg-neutral-primary border ${borderColor} min-w-[210px] transition-colors`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-neutral-primary border-2 border-default" />

      <div className="flex flex-col">
        <div className="flex items-center justify-between pb-2 border-b border-default">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1 bg-neutral-secondary rounded shrink-0">
              <Cpu className="w-3.5 h-3.5 text-fg-muted" />
            </div>
            <span className="font-bold text-xs text-heading uppercase tracking-tight truncate">
              {data.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 ml-2 shrink-0">
            {getStatusIcon()}
            <CompletenessRing pct={completeness} />
          </div>
        </div>

        <div className="py-2 space-y-1">
          <div className="text-[10px] text-fg-muted font-semibold uppercase tracking-wider">Responsibilities</div>
          <div className="text-xs text-body leading-tight line-clamp-2 italic">
            &ldquo;{data.responsibilities || 'Not specified'}&rdquo;
          </div>
        </div>

        <div className="flex items-center justify-between mt-1 pt-2 border-t border-default">
          <div className="flex items-center gap-1">
            {data.type && (
              <span className="text-[10px] bg-neutral-tertiary px-1.5 py-0.5 rounded text-fg-muted font-mono border border-default truncate max-w-[80px]">
                {data.type}
              </span>
            )}
            {data.technologyStack && (
              <span className="text-[10px] bg-brand-softer text-fg-brand px-1.5 py-0.5 rounded font-mono border border-brand-soft truncate max-w-[80px]" title={data.technologyStack}>
                {data.technologyStack.split(',')[0]}
              </span>
            )}
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-neutral-primary border-2 border-default" />
    </div>
  );
};

export default memo(ServoNode);
