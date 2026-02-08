'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon, Maximize2, Minimize2 } from 'lucide-react';

interface ChartRendererProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[];
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#06b6d4'];

export default function ChartRenderer({ data }: ChartRendererProps) {
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie'>('bar');
  const [isExpanded, setIsExpanded] = useState(false);

  const analysis = useMemo(() => {
    if (!data || !Array.isArray(data) || data.length === 0) return null;

    const firstItem = data[0];
    const keys = Object.keys(firstItem);

    const labelKey = keys.find(key => typeof firstItem[key] === 'string') || keys[0];
    
    const valueKeys = keys.filter(key => typeof firstItem[key] === 'number');

    if (valueKeys.length === 0) return null;

    let suggestedType: 'bar' | 'line' | 'pie' = 'bar';
    if (labelKey.toLowerCase().includes('date') || labelKey.toLowerCase().includes('time') || labelKey.toLowerCase().includes('year')) {
      suggestedType = 'line';
    } else if (data.length <= 5 && valueKeys.length === 1) {
      suggestedType = 'pie';
    } else if (data.length > 20) {
      suggestedType = 'line';
    }

    return { labelKey, valueKeys, suggestedType };
  }, [data]);

  useEffect(() => {
    if (analysis) {
       // eslint-disable-next-line
       setChartType(analysis.suggestedType);
    }
  }, [analysis]);

  if (!analysis) return null;

  const { labelKey, valueKeys } = analysis;

  const renderChart = () => {
    switch (chartType) {
      case 'line':
        return (
          <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey={labelKey} 
              stroke="#9ca3af" 
              tick={{ fill: '#9ca3af' }}
              tickFormatter={(value) => String(value).substring(0, 15)} 
              minTickGap={30}
            />
            <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#f3f4f6' }}
            />
            <Legend verticalAlign="top" height={36} iconType="circle" />
            {valueKeys.map((key, index) => (
              <Line 
                key={key}
                type="monotone" 
                dataKey={key} 
                stroke={COLORS[index % COLORS.length]} 
                strokeWidth={2}
                dot={data.length < 50 ? { r: 4, strokeWidth: 2 } : false}
                activeDot={{ r: 8 }}
              />
            ))}
          </LineChart>
        );
      case 'pie':
        return (
          <PieChart>
             <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ percent }) => `${((percent || 0) * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey={valueKeys[0]}
              nameKey={labelKey}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#f3f4f6' }}
            />
            <Legend verticalAlign="top" height={36} />
          </PieChart>
        );
      case 'bar':
      default:
        return (
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey={labelKey} 
              stroke="#9ca3af" 
              tick={{ fill: '#9ca3af' }}
              tickFormatter={(value) => String(value).substring(0, 10)} 
              minTickGap={30}
            />
            <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#f3f4f6' }}
              cursor={{ fill: '#27272a' }}
            />
            <Legend verticalAlign="top" height={36} iconType="circle" />
            {valueKeys.map((key, index) => (
              <Bar 
                key={key} 
                dataKey={key} 
                fill={COLORS[index % COLORS.length]} 
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        );
    }
  };

  return (
    <div className={`w-full transition-all duration-300 ${isExpanded ? 'fixed inset-4 z-50 bg-zinc-950/95 backdrop-blur-xl border border-zinc-800 rounded-2xl p-8 shadow-2xl' : 'h-[300px] mt-4 p-4 border border-zinc-800/50 bg-zinc-900/30 rounded-xl'}`}>
      
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 bg-zinc-800/50 rounded-lg p-1">
          <button 
            onClick={() => setChartType('bar')}
            className={`p-1.5 rounded-md transition-all ${chartType === 'bar' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'}`}
            title="Bar Chart"
          >
            <BarChart3 className="w-4 h-4" />
          </button>
          <button 
             onClick={() => setChartType('line')}
             className={`p-1.5 rounded-md transition-all ${chartType === 'line' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'}`}
             title="Line Chart"
          >
            <LineChartIcon className="w-4 h-4" />
          </button>
          <button 
             onClick={() => setChartType('pie')}
             disabled={valueKeys.length > 1}
             className={`p-1.5 rounded-md transition-all ${chartType === 'pie' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'} ${valueKeys.length > 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
             title="Pie Chart"
          >
            <PieChartIcon className="w-4 h-4" />
          </button>
        </div>

        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      <div className="w-full h-[calc(100%-48px)] overflow-x-auto overflow-y-hidden">
        <div style={{ width: chartType === 'bar' && data.length > 10 ? `${Math.max(100, data.length * 6)}%` : '100%', height: '100%', minWidth: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            {renderChart()}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
