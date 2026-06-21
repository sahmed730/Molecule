import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

interface MermaidChartProps {
  chart: string;
}

const MermaidChart: React.FC<MermaidChartProps> = ({ chart }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: true,
      theme: 'default',
      securityLevel: 'loose',
    });
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (containerRef.current && chart) {
      containerRef.current.innerHTML = '';
      try {
        const id = `mermaid-id-${Math.random().toString(36).substring(2, 9).replace(/^[0-9]/, 'a')}`;
        mermaid.render(id, chart.trim())
          .then(({ svg }) => {
            if (isMounted && containerRef.current) {
              containerRef.current.innerHTML = svg;
            }
          })
          .catch((error) => {
            console.error("Mermaid parsing error:", error);
            if (isMounted && containerRef.current) {
               containerRef.current.innerHTML = `<div class="text-red-500 text-xs">Failed to render flowchart. Check syntax. <br/> <pre class="mt-2 text-[10px] overflow-auto">${chart}</pre></div>`;
            }
          });
      } catch (e) {
        console.error("Mermaid synchronous error:", e);
      }
    }
    return () => { isMounted = false; };
  }, [chart]);

  return <div ref={containerRef} className="mermaid-chart flex justify-center w-full h-full overflow-auto p-4" />;
};

export default MermaidChart;
