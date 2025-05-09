import React, { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import useEvalutationStore from '@/stores/evaluation'
import { Metric, Evaluation, APIEvaluation } from '@/types'

// API Types
interface SingleEvaluationRequest {
  caseId: string
  responseId: string
  metricId: string
  score: number
}

interface BatchEvaluationRequest {
  case_id: string
  evaluations: {
    response_id: string
    metrics: {
      metric_id: string
      score: number
    }[]
  }[]
}

interface EvaluationResponse {
  model_responses: {
    id: string
    evaluations: APIEvaluation[]
  }[]
}

export interface ModelScore {
  responseId: string
  metrics: {
    id: string
    name: string
    value: number
  }[]
}

interface ModelResponse {
  id: string;
  model_name: string;
  response: {
    responseId: string;
    response: string;
    evaluations?: APIEvaluation[];
  };
}

interface EvaluationMetricsProps {
  activeRecordId: string
  metrics: Metric[]
  isSubmitting?: boolean
  onStatusChange?: (status: string) => void
  modelResponses: ModelResponse[]
}

interface EvaluationProgress {
  completed: number
  total: number
  status: string
}

// Helper function to get score color
const getScoreColor = (score: number | null): string => {
  if (score === null) return '';
  const colors = {
    1: 'bg-red-500/20 text-red-500',
    2: 'bg-orange-500/20 text-orange-500',
    3: 'bg-yellow-500/20 text-yellow-500',
    4: 'bg-lime-500/20 text-lime-500',
    5: 'bg-green-500/20 text-green-500'
  };
  return colors[score as keyof typeof colors] || '';
};

export const EvaluationMetrics: React.FC<EvaluationMetricsProps> = ({
  activeRecordId,
  metrics,
  isSubmitting = false,
  onStatusChange,
  modelResponses
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<EvaluationProgress>({ completed: 0, total: 0, status: 'pending' });
  const evaluation = useEvalutationStore((state) => state.evaluation)
  const setEvaluation = useEvalutationStore((state) => state.setEvaluation)

  const activeEvaluation = activeRecordId ? evaluation[activeRecordId] : undefined

  // Function to update individual evaluation
  const updateEvaluation = async (responseId: string, metricId: string, value: number | null) => {
    if (value !== null && (value < 1 || value > 5)) {
      console.error('Invalid score value:', value);
      return;
    }

    try {
      // Optimistically update local state first
      setEvaluation(activeRecordId, {
        metricId,
        responseId,
        value,
      });

      // Get evaluatorId from URL params or context
      const urlParams = new URLSearchParams(window.location.search);
      const evaluatorId = urlParams.get('doctorId');

      // Prepare request data according to API contract
      const requestData = {
        caseId: activeRecordId,
        responseId,
        metricId,
        evaluatorId,
        score: value ?? 0
      };

      // Make API call to update backend
      const response = await fetch('/api/cases/evaluations/update/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        console.error('API Error:', await response.text());
        return;
      }

      const data = await response.json();
      onStatusChange?.(data.status);

    } catch (error) {
      console.error('Error updating evaluation:', error);
    }
  };

  // Check if metrics are still loading
  if (!metrics || metrics.length === 0 || metrics[0].id === '0') {
    return (
      <div className="rounded-lg border border-medical-dark-gray/30 overflow-hidden">
        <div className="bg-medical-dark-gray/50 p-3 border-b border-medical-dark-gray/30">
          <h2 className="text-lg font-medium">EVALUATION METRICS</h2>
        </div>
        <div className="p-8 text-center">
          <div className="flex items-center justify-center mb-2">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Loading metrics data...
          </div>
        </div>
      </div>
    );
  }

  // If parent component is submitting, show loading state
  if (isSubmitting) {
    return (
      <div className="rounded-lg border border-medical-dark-gray/30 overflow-hidden">
        <div className="bg-medical-dark-gray/50 p-3 border-b border-medical-dark-gray/30">
          <h2 className="text-lg font-medium">EVALUATION METRICS</h2>
        </div>
        <div className="p-8 text-center">
          <div className="flex items-center justify-center mb-2">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processing...
          </div>
        </div>
      </div>
    );
  }

  // If no active evaluation data, show message
  if (!activeEvaluation || activeEvaluation.length === 0) {
    return (
      <div className="rounded-lg border border-medical-dark-gray/30 overflow-hidden">
        <div className="bg-medical-dark-gray/50 p-3 border-b border-medical-dark-gray/30">
          <h2 className="text-lg font-medium">EVALUATION METRICS</h2>
        </div>
        <div className="p-8 text-center">
          <p>No evaluation data available. Please refresh the page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-medical-dark-gray/30 overflow-hidden">
      <div className="bg-medical-dark-gray/50 p-3 border-b border-medical-dark-gray/30">
        <h2 className="text-lg font-medium">EVALUATION METRICS</h2>
      </div>

      <div className="overflow-x-auto w-full">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-medical-dark-gray/30 border-b border-medical-dark-gray/30">
              <th className="p-3 text-left w-24">MODEL</th>
              {metrics.map((metric) => (
                <th key={metric.id} className="p-3 text-center">
                  {metric.name}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {modelResponses
              .filter(modelResponse => modelResponse.response && modelResponse.response.response)
              .map((modelResponse) => {
                const model = activeEvaluation?.find(m => m.responseId === modelResponse.id) || {
                  responseId: modelResponse.id,
                  metrics: metrics.map(m => ({ id: m.id, name: m.name, value: null }))
                };

                return (
                  <tr
                    key={model.responseId}
                    className="border-b border-medical-dark-gray/20"
                  >
                    <td className="p-3 font-medium text-left">
                      {modelResponse.model_name}
                    </td>

                    {metrics.map((metric) => {
                      const score = model.metrics.find(
                        (x) => x.id === metric.id
                      )?.value;

                      return (
                        <td
                          key={`${model.responseId}-${metric.id}`}
                          className="p-3 text-center"
                        >
                          <select
                            value={score ?? ''}
                            name="metrics"
                            id="rate-model-output"
                            disabled={isSubmitting}
                            onChange={(e) => {
                              const val = e.target.value;
                              const newValue = val === '' ? null : Number(val);
                              updateEvaluation(model.responseId, metric.id, newValue);
                            }}
                            className={cn(
                              "w-20 h-8 rounded text-center",
                              getScoreColor(score),
                              "border border-medical-dark-gray/30",
                              "focus:outline-none focus:ring-2 focus:ring-medical-blue",
                              "disabled:opacity-50"
                            )}
                          >
                            <option value="">--</option>
                            {[1, 2, 3, 4, 5].map((value) => (
                              <option 
                                key={value} 
                                value={value}
                                className={cn(
                                  getScoreColor(value),
                                  "font-medium"
                                )}
                              >
                                {value}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
